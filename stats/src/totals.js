// Running totals for the stats page. Each run folds only the new pool and Router events into one
// small KV value, so storage no longer grows with every swap (the old `events` list kept them all
// and would have hit KV's 25 MB value limit).
//
// What grows, and why it stays small:
//   - all-time sums and counts: fixed size
//   - 24 h / 7 d windows: 10-minute buckets for the last 7 days (at most 1,008, older ones dropped).
//     A window starts at a bucket edge, so it can include up to 10 minutes more than exact.
//   - deposits: [label, depositor] per deposit, needed to count approved depositors against the
//     ASP's set (which changes). Grows per deposit, not per swap; deposits are capped by the ASP.
//
// Amounts are decimal strings (JSON has no bigint), added with BigInt. Pure: no chain, no KV.

import { PIECE_BUCKETS } from "./aggregate.js";

export const BUCKET_SECONDS = 600;
const DAY = 86_400;
const KEEP_SECONDS = 7 * DAY;
const USDG_UNIT = 1_000_000n;

const add = (total, amount) => (BigInt(total) + BigInt(amount)).toString();

/** @param {bigint|string} lastBlock the block before the first one to read */
export function emptyTotals(lastBlock) {
  return {
    version: 1,
    lastBlock: lastBlock.toString(),
    deposits: [],
    flows: { deposited: "0", withdrawnToPieces: "0", takenBack: "0", withdrawals: 0, ragequits: 0 },
    all: emptyWindow(),
    pieceSizes: PIECE_BUCKETS.map(() => 0),
    relayer: { feesTotal: "0", swaps: 0 },
    buckets: [],
  };
}

function emptyWindow() {
  // byToken is keyed by lowercase token address; symbols are applied when the summary is made.
  return { pieces: 0, usdg: "0", sells: 0, sellUsdg: "0", byToken: {} };
}

function addSwapTo(window, swap, kind) {
  if (kind === "buy") {
    window.pieces += 1;
    window.usdg = add(window.usdg, swap.amountIn);
    const token = swap.tokenOut.toLowerCase();
    window.byToken[token] ??= { pieces: 0, usdg: "0" };
    window.byToken[token].pieces += 1;
    window.byToken[token].usdg = add(window.byToken[token].usdg, swap.amountIn);
  } else if (kind === "sell") {
    window.sells += 1;
    window.sellUsdg = add(window.sellUsdg, swap.amountOut);
  }
}

/**
 * Adds one event to the totals (mutates and returns them).
 * @param {object} totals from emptyTotals()
 * @param {{type: "deposit"|"withdrawal"|"ragequit"|"swap", [key: string]: any}} event amounts as bigint or string
 * @param {{usdg: string, now: number}} context
 */
export function addEvent(totals, event, { usdg, now }) {
  if (event.type === "deposit") {
    totals.deposits.push([event.label.toString(), event.depositor.toLowerCase()]);
    totals.flows.deposited = add(totals.flows.deposited, event.value);
  } else if (event.type === "withdrawal") {
    totals.flows.withdrawals += 1;
    totals.flows.withdrawnToPieces = add(totals.flows.withdrawnToPieces, event.value);
  } else if (event.type === "ragequit") {
    totals.flows.ragequits += 1;
    totals.flows.takenBack = add(totals.flows.takenBack, event.value);
  } else if (event.type === "swap") {
    const usdgAddress = usdg.toLowerCase();
    // A buy piece pays USDG for a stock token; a sell turns a stock token into USDG.
    const kind =
      event.tokenIn.toLowerCase() === usdgAddress ? "buy" : event.tokenOut.toLowerCase() === usdgAddress ? "sell" : "other";
    totals.relayer.swaps += 1;
    totals.relayer.feesTotal = add(totals.relayer.feesTotal, event.fee);
    addSwapTo(totals.all, event, kind);
    if (kind === "buy") {
      const amount = BigInt(event.amountIn);
      const index = PIECE_BUCKETS.findIndex(
        ([from, to]) => amount >= BigInt(from) * USDG_UNIT && (to === null || amount < BigInt(to) * USDG_UNIT),
      );
      totals.pieceSizes[index] += 1;
    }
    const start = Math.floor(event.time / BUCKET_SECONDS) * BUCKET_SECONDS;
    // Older than the 7-day window (or no block time): counted in all-time totals only.
    if (kind !== "other" && start + BUCKET_SECONDS > now - KEEP_SECONDS) {
      let bucket = totals.buckets.find((item) => item.start === start);
      if (!bucket) {
        bucket = { start, ...emptyWindow() };
        totals.buckets.push(bucket);
        totals.buckets.sort((a, b) => a.start - b.start);
      }
      addSwapTo(bucket, event, kind);
    }
  }
  return totals;
}

/** Drops buckets that ended before the 7-day window (mutates and returns the totals). */
export function prune(totals, now) {
  totals.buckets = totals.buckets.filter((bucket) => bucket.start + BUCKET_SECONDS > now - KEEP_SECONDS);
  return totals;
}

/**
 * One-time migration from the old KV value `events` (every event, amounts as strings).
 * @param {{lastBlock: string, deposits: any[], withdrawals: any[], ragequits: any[], swaps: any[]}} saved
 */
export function fromEvents(saved, { usdg, now }) {
  const totals = emptyTotals(saved.lastBlock);
  const context = { usdg, now };
  for (const deposit of saved.deposits) addEvent(totals, { type: "deposit", ...deposit }, context);
  for (const withdrawal of saved.withdrawals) addEvent(totals, { type: "withdrawal", ...withdrawal }, context);
  for (const ragequit of saved.ragequits) addEvent(totals, { type: "ragequit", ...ragequit }, context);
  for (const swap of saved.swaps) addEvent(totals, { type: "swap", ...swap }, context);
  return prune(totals, now);
}

/**
 * The stats page numbers from the totals: the same shape aggregate() returned from every event
 * (amounts as bigint; the Worker turns them into strings).
 * @param {object} totals
 * @param {{symbols: Record<string, string>, approvedSet: {labels: bigint[], rejected: Array<{label: string, reason: string}>} | null, now: number}} context
 */
export function summarize(totals, { symbols, approvedSet, now }) {
  const symbolOf = (address) => symbols[address] ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  const big = (value) => BigInt(value);

  // 1. Crowd: approved deposits are the ones a withdrawal proof can point to.
  const approvedLabels = new Set((approvedSet?.labels ?? []).map(String));
  const approved = totals.deposits.filter(([label]) => approvedLabels.has(label));
  const crowd = {
    deposits: totals.deposits.length,
    approvedDeposits: approvedSet ? approved.length : null,
    approvedDepositors: approvedSet ? new Set(approved.map(([, depositor]) => depositor)).size : null,
  };

  // 2. Shielded balance flows (the current balance is read from the token, not computed).
  const flows = {
    deposited: big(totals.flows.deposited),
    withdrawnToPieces: big(totals.flows.withdrawnToPieces),
    takenBack: big(totals.flows.takenBack),
  };

  // 3. Routed volume per window, from the buckets that overlap it.
  const toWindow = (window) => {
    const byToken = {};
    for (const [token, item] of Object.entries(window.byToken)) {
      const symbol = symbolOf(token);
      byToken[symbol] ??= { pieces: 0, usdg: 0n };
      byToken[symbol].pieces += item.pieces;
      byToken[symbol].usdg += big(item.usdg);
    }
    return { pieces: window.pieces, usdg: big(window.usdg), sells: window.sells, sellUsdg: big(window.sellUsdg), byToken };
  };
  const sumBuckets = (since) => {
    const window = emptyWindow();
    for (const bucket of totals.buckets) {
      if (bucket.start + BUCKET_SECONDS <= since) continue;
      window.pieces += bucket.pieces;
      window.usdg = add(window.usdg, bucket.usdg);
      window.sells += bucket.sells;
      window.sellUsdg = add(window.sellUsdg, bucket.sellUsdg);
      for (const [token, item] of Object.entries(bucket.byToken)) {
        window.byToken[token] ??= { pieces: 0, usdg: "0" };
        window.byToken[token].pieces += item.pieces;
        window.byToken[token].usdg = add(window.byToken[token].usdg, item.usdg);
      }
    }
    return toWindow(window);
  };
  const routed = { "24h": sumBuckets(now - DAY), "7d": sumBuckets(now - 7 * DAY), all: toWindow(totals.all) };

  // 4. Piece sizes (buys, all time).
  const pieceSizes = PIECE_BUCKETS.map(([from, to], index) => ({ from, to, pieces: totals.pieceSizes[index] }));

  // 5. Clean-funds check, as the ASP published it.
  const reasons = {};
  for (const item of approvedSet?.rejected ?? []) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  const cleanFunds = approvedSet
    ? {
        approved: approvedSet.labels.length,
        rejected: approvedSet.rejected.length,
        reasons,
        waiting: Math.max(0, totals.deposits.length - approvedSet.labels.length - approvedSet.rejected.length),
      }
    : null;

  // 6. Relayer fees: what the relayer took per swap (pieces and sells).
  const relayer = { feesTotal: big(totals.relayer.feesTotal), swaps: totals.relayer.swaps };

  return { crowd, flows, routed, pieceSizes, cleanFunds, relayer };
}
