import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregate } from "../src/aggregate.js";
import { BUCKET_SECONDS, addEvent, emptyTotals, fromEvents, prune, summarize } from "../src/totals.js";

const USDG = "0x00000000000000000000000000000000000000Aa";
const MSTK = "0x00000000000000000000000000000000000000Bb";
// A bucket edge, so the 24 h and 7 d windows start exactly where the buckets do.
const NOW = 1_800_000_000 - (1_800_000_000 % BUCKET_SECONDS);
const DAY = 86_400;
const usdg = (whole) => BigInt(Math.round(whole * 1e6));
const symbols = { [MSTK.toLowerCase()]: "MSTK" };
const approvedSet = { labels: [1n, 2n, 3n], rejected: [{ label: "4", reason: "deposit above the per-deposit cap" }] };

const events = {
  deposits: [
    { label: 1n, depositor: "0x1111111111111111111111111111111111111111", value: usdg(15), time: NOW - 10 * DAY },
    { label: 2n, depositor: "0x1111111111111111111111111111111111111111", value: usdg(15), time: NOW - 9 * DAY },
    { label: 3n, depositor: "0x2222222222222222222222222222222222222222", value: usdg(8), time: NOW - DAY },
    { label: 4n, depositor: "0x3333333333333333333333333333333333333333", value: usdg(2000), time: NOW - 60 },
    { label: 5n, depositor: "0x4444444444444444444444444444444444444444", value: usdg(3), time: NOW - 60 },
  ],
  withdrawals: [{ value: usdg(2), time: NOW - 100 }, { value: usdg(3), time: NOW - 200 }],
  ragequits: [{ value: usdg(25), time: NOW - 300 }],
  swaps: [
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(2.01), amountOut: 10n, fee: usdg(0.1), time: NOW - 60 },
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(1.79), amountOut: 10n, fee: usdg(0.1), time: NOW - 3 * DAY },
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(0.5), amountOut: 3n, fee: usdg(0.1), time: NOW - 6 * DAY },
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(150), amountOut: 10n, fee: usdg(0.1), time: NOW - 30 * DAY },
    { tokenIn: MSTK, tokenOut: USDG, amountIn: 5n, amountOut: usdg(1.39), fee: usdg(0.1), time: NOW - 120 },
    { tokenIn: MSTK, tokenOut: USDG, amountIn: 5n, amountOut: usdg(2), fee: usdg(0.1), time: NOW - 2 * DAY },
  ],
};
// What the old Worker kept in KV: every event, amounts as strings.
const stored = JSON.parse(JSON.stringify({ lastBlock: "123", ...events }, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));

test("the migrated totals give the same summary as the old full event list", () => {
  const expected = aggregate({ ...events, usdg: USDG, symbols, approvedSet, now: NOW });
  const totals = fromEvents(stored, { usdg: USDG, now: NOW });
  assert.equal(totals.lastBlock, "123");
  assert.deepEqual(summarize(totals, { symbols, approvedSet, now: NOW }), expected);
  // also without an ASP set
  assert.deepEqual(summarize(totals, { symbols, approvedSet: null, now: NOW }), aggregate({ ...events, usdg: USDG, symbols, approvedSet: null, now: NOW }));
});

test("adding events one run at a time matches adding them all at once", () => {
  const all = fromEvents(stored, { usdg: USDG, now: NOW });
  const runs = emptyTotals(0n);
  // first half of the swaps in one run, the rest (and everything else) in a later run
  const half = Math.ceil(stored.swaps.length / 2);
  for (const swap of stored.swaps.slice(0, half)) addEvent(runs, { type: "swap", ...swap }, { usdg: USDG, now: NOW });
  for (const deposit of stored.deposits) addEvent(runs, { type: "deposit", ...deposit }, { usdg: USDG, now: NOW });
  for (const item of stored.withdrawals) addEvent(runs, { type: "withdrawal", ...item }, { usdg: USDG, now: NOW });
  for (const item of stored.ragequits) addEvent(runs, { type: "ragequit", ...item }, { usdg: USDG, now: NOW });
  for (const swap of stored.swaps.slice(half)) addEvent(runs, { type: "swap", ...swap }, { usdg: USDG, now: NOW });
  assert.deepEqual(summarize(runs, { symbols, approvedSet, now: NOW }), summarize(all, { symbols, approvedSet, now: NOW }));
});

test("windows move forward: a day later the 24 h window is empty and old buckets are dropped", () => {
  const totals = fromEvents(stored, { usdg: USDG, now: NOW });
  const later = NOW + 8 * DAY;
  prune(totals, later);
  assert.equal(totals.buckets.length, 0);
  const summary = summarize(totals, { symbols, approvedSet, now: later });
  assert.equal(summary.routed["24h"].pieces, 0);
  assert.equal(summary.routed["7d"].pieces, 0);
  assert.equal(summary.routed.all.pieces, 4);
  assert.equal(summary.routed.all.usdg, usdg(154.3));
});

test("storage stays small: 10,000 swaps over 7 days keep at most 1,008 buckets", () => {
  const totals = emptyTotals(0n);
  for (let i = 0; i < 10_000; i += 1) {
    const time = NOW - Math.floor((i / 10_000) * 7 * DAY);
    addEvent(totals, { type: "swap", tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(2), amountOut: 1n, fee: usdg(0.1), time }, { usdg: USDG, now: NOW });
  }
  prune(totals, NOW);
  assert.ok(totals.buckets.length <= (7 * DAY) / BUCKET_SECONDS + 1, `${totals.buckets.length} buckets`);
  assert.ok(JSON.stringify(totals).length < 300_000, `${JSON.stringify(totals).length} bytes`);
  const summary = summarize(totals, { symbols, approvedSet: null, now: NOW });
  assert.equal(summary.routed.all.pieces, 10_000);
  assert.equal(summary.routed["7d"].pieces, 10_000);
  assert.equal(summary.relayer.feesTotal, usdg(1000));
});

test("a window starts at a bucket edge, so it may include up to 10 minutes more than exact", () => {
  const now = NOW + 300; // halfway through a bucket
  const totals = emptyTotals(0n);
  // 24 h and 2 minutes old: outside an exact 24 h window, inside the bucket that overlaps its start
  addEvent(totals, { type: "swap", tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(1), amountOut: 1n, fee: 0n, time: now - DAY - 120 }, { usdg: USDG, now });
  const summary = summarize(totals, { symbols, approvedSet: null, now });
  assert.equal(summary.routed["24h"].pieces, 1);
  // older than the overlapping bucket: out
  const older = emptyTotals(0n);
  addEvent(older, { type: "swap", tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(1), amountOut: 1n, fee: 0n, time: now - DAY - 900 }, { usdg: USDG, now });
  assert.equal(summarize(older, { symbols, approvedSet: null, now }).routed["24h"].pieces, 0);
});
