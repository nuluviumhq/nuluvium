// Turns the public events of the Nuluvium pool and Router into the numbers on the stats page.
// Pure (no chain, no KV) so it can be tested. The Worker now keeps running totals (totals.js);
// aggregate() over the full event list stays as the reference the totals are tested against. Only totals over everyone: nothing here is per user,
// and the page never lists addresses or links deposits to pieces.

import { countCodes } from "./reasons.js";

const HOUR = 3600;
const DAY = 24 * HOUR;

/** Piece size buckets in whole USDG: [from, to). The last bucket has no upper end. */
export const PIECE_BUCKETS = [
  [0, 1],
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 25],
  [25, 100],
  [100, null],
];
const USDG_UNIT = 1_000_000n;

const sum = (values) => values.reduce((total, value) => total + value, 0n);

/**
 * @param {object} input
 * @param {Array<{label: bigint, depositor: string, value: bigint}>} input.deposits
 * @param {Array<{value: bigint}>} input.withdrawals  Withdrawn events (each one pays a piece through the Router)
 * @param {Array<{value: bigint}>} input.ragequits
 * @param {Array<{tokenIn: string, tokenOut: string, amountIn: bigint, amountOut: bigint, fee: bigint, protocolFee?: bigint, time: number}>} input.swaps
 * @param {string} input.usdg               USDG token address
 * @param {Record<string, string>} input.symbols  lowercase token address → symbol
 * @param {{labels: bigint[], rejected: Array<{label: string, reason: string}>} | null} input.approvedSet
 * @param {number} input.now               unix seconds
 */
export function aggregate({ deposits, withdrawals, ragequits, swaps, usdg, symbols, approvedSet, now }) {
  const usdgAddress = usdg.toLowerCase();
  const symbolOf = (address) => symbols[address.toLowerCase()] ?? `${address.slice(0, 6)}…${address.slice(-4)}`;

  // 1. Crowd: approved deposits are the ones a withdrawal proof can point to.
  const approvedLabels = new Set((approvedSet?.labels ?? []).map(String));
  const approved = deposits.filter((deposit) => approvedLabels.has(deposit.label.toString()));
  const crowd = {
    deposits: deposits.length,
    approvedDeposits: approvedSet ? approved.length : null,
    approvedDepositors: approvedSet ? new Set(approved.map((deposit) => deposit.depositor.toLowerCase())).size : null,
  };

  // 2. Shielded balance flows (the current balance is read from the token, not computed).
  const flows = {
    deposited: sum(deposits.map((deposit) => deposit.value)),
    withdrawnToPieces: sum(withdrawals.map((withdrawal) => withdrawal.value)),
    takenBack: sum(ragequits.map((ragequit) => ragequit.value)),
  };

  // 3. Routed volume. A buy piece pays USDG for a stock token; a sell turns a stock token into USDG.
  const buys = swaps.filter((swap) => swap.tokenIn.toLowerCase() === usdgAddress);
  const sells = swaps.filter((swap) => swap.tokenIn.toLowerCase() !== usdgAddress && swap.tokenOut.toLowerCase() === usdgAddress);
  const windows = { "24h": now - DAY, "7d": now - 7 * DAY, all: -Infinity };
  const routed = Object.fromEntries(
    Object.entries(windows).map(([name, since]) => {
      const windowBuys = buys.filter((swap) => swap.time >= since);
      const windowSells = sells.filter((swap) => swap.time >= since);
      const byToken = {};
      for (const swap of windowBuys) {
        const symbol = symbolOf(swap.tokenOut);
        byToken[symbol] ??= { pieces: 0, usdg: 0n };
        byToken[symbol].pieces += 1;
        byToken[symbol].usdg += swap.amountIn;
      }
      return [
        name,
        {
          pieces: windowBuys.length,
          usdg: sum(windowBuys.map((swap) => swap.amountIn)),
          sells: windowSells.length,
          sellUsdg: sum(windowSells.map((swap) => swap.amountOut)),
          byToken,
        },
      ];
    }),
  );

  // 4. Piece sizes (buys, all time).
  const pieceSizes = PIECE_BUCKETS.map(([from, to]) => ({
    from,
    to,
    pieces: buys.filter((swap) => swap.amountIn >= BigInt(from) * USDG_UNIT && (to === null || swap.amountIn < BigInt(to) * USDG_UNIT)).length,
  }));

  // 5. Clean-funds check, as the ASP published it.
  const reasons = {};
  for (const item of approvedSet?.rejected ?? []) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  const cleanFunds = approvedSet
    ? { approved: approvedSet.labels.length, rejected: approvedSet.rejected.length, reasons, codes: countCodes(approvedSet.rejected), waiting: Math.max(0, deposits.length - approvedSet.labels.length - approvedSet.rejected.length) }
    : null;

  // 6. Relayer fees: what the relayer took per swap (pieces and sells).
  const relayer = { feesTotal: sum(swaps.map((swap) => swap.fee)), swaps: swaps.length };

  // 7. Protocol fee (Router v2 swaps only): half to the sending relayer, the rest to the treasury.
  const v2 = swaps.filter((swap) => swap.protocolFee !== undefined && swap.protocolFee !== null);
  const toRelayers = sum(v2.map((swap) => (BigInt(swap.protocolFee) * 5_000n) / 10_000n));
  const feesTotal = sum(v2.map((swap) => BigInt(swap.protocolFee)));
  const protocol = { feesTotal, toRelayers, toTreasury: feesTotal - toRelayers, swaps: v2.length };

  return { crowd, flows, routed, pieceSizes, cleanFunds, relayer, protocol };
}

/** JSON can't hold bigint: amounts become decimal strings in token units. */
export function toJson(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
}
