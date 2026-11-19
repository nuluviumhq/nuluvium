import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregate, toJson } from "../src/aggregate.js";

const USDG = "0x00000000000000000000000000000000000000Aa";
const MSTK = "0x00000000000000000000000000000000000000Bb";
const NOW = 1_800_000_000;
const DAY = 86_400;
const usdg = (whole) => BigInt(Math.round(whole * 1e6));

const base = {
  deposits: [
    { label: 1n, depositor: "0x1111111111111111111111111111111111111111", value: usdg(15) },
    { label: 2n, depositor: "0x1111111111111111111111111111111111111111", value: usdg(15) },
    { label: 3n, depositor: "0x2222222222222222222222222222222222222222", value: usdg(8) },
    { label: 4n, depositor: "0x3333333333333333333333333333333333333333", value: usdg(2000) },
    { label: 5n, depositor: "0x4444444444444444444444444444444444444444", value: usdg(3) },
  ],
  withdrawals: [{ value: usdg(2) }, { value: usdg(3) }],
  ragequits: [{ value: usdg(25) }],
  swaps: [
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(2.01), amountOut: 10n, fee: usdg(0.1), time: NOW - 60 },
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(1.79), amountOut: 10n, fee: usdg(0.1), time: NOW - 3 * DAY },
    { tokenIn: USDG, tokenOut: MSTK, amountIn: usdg(150), amountOut: 10n, fee: usdg(0.1), time: NOW - 30 * DAY },
    { tokenIn: MSTK, tokenOut: USDG, amountIn: 5n, amountOut: usdg(1.39), fee: usdg(0.1), time: NOW - 120 },
  ],
  usdg: USDG.toLowerCase(),
  symbols: { [MSTK.toLowerCase()]: "MSTK" },
  approvedSet: { labels: [1n, 2n, 3n], rejected: [{ label: "4", reason: "deposit above the per-deposit cap" }] },
  now: NOW,
};

test("crowd counts approved deposits and their distinct wallets", () => {
  const { crowd } = aggregate(base);
  assert.deepEqual(crowd, { deposits: 5, approvedDeposits: 3, approvedDepositors: 2 });
});

test("without an approved set the crowd and clean-funds numbers are unknown, not zero", () => {
  const result = aggregate({ ...base, approvedSet: null });
  assert.equal(result.crowd.approvedDeposits, null);
  assert.equal(result.cleanFunds, null);
});

test("flows add up deposits, withdrawals to pieces and take-backs", () => {
  assert.deepEqual(aggregate(base).flows, { deposited: usdg(2041), withdrawnToPieces: usdg(5), takenBack: usdg(25) });
});

test("routed volume per window; sells are counted apart from buy pieces", () => {
  const { routed } = aggregate(base);
  assert.equal(routed["24h"].pieces, 1);
  assert.equal(routed["24h"].usdg, usdg(2.01));
  assert.equal(routed["24h"].sells, 1);
  assert.equal(routed["24h"].sellUsdg, usdg(1.39));
  assert.equal(routed["7d"].pieces, 2);
  assert.equal(routed.all.pieces, 3);
  assert.deepEqual(routed.all.byToken, { MSTK: { pieces: 3, usdg: usdg(153.8) } });
});

test("piece sizes fall into buckets by whole USDG", () => {
  const sizes = Object.fromEntries(aggregate(base).pieceSizes.map((bucket) => [`${bucket.from}-${bucket.to ?? ""}`, bucket.pieces]));
  assert.deepEqual(sizes, { "0-1": 0, "1-2": 1, "2-5": 1, "5-10": 0, "10-25": 0, "25-100": 0, "100-": 1 });
});

test("clean-funds tally with reasons and the deposits still waiting", () => {
  assert.deepEqual(aggregate(base).cleanFunds, { approved: 3, rejected: 1, reasons: { "deposit above the per-deposit cap": 1 }, waiting: 1 });
});

test("relayer fees cover every swap; JSON output has no bigints", () => {
  const result = aggregate(base);
  assert.deepEqual(result.relayer, { feesTotal: usdg(0.4), swaps: 4 });
  assert.equal(toJson(result).relayer.feesTotal, "400000");
});
