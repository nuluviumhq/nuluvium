import assert from "node:assert/strict";
import { test } from "node:test";
import { orderLimits, type LimitNote } from "./orderLimits.ts";

const U = 1_000_000n;
const note = (index: number, value: number, approval: LimitNote["approval"] = "approved"): LimitNote => ({ depositIndex: BigInt(index), value: BigInt(value) * U, approval });
const base = { openOrders: [], minAmount: 3n * U };

test("reading: no blocker before the balance is known", () => {
  assert.deepEqual(orderLimits({ ...base, notes: undefined, amount: 10n * U }), { maxSpend: undefined, blocker: null });
});

test("one order pays from the largest free approved deposit", () => {
  const result = orderLimits({ ...base, notes: [note(0, 4), note(5, 1)], amount: 4n * U });
  assert.equal(result.maxSpend, 4n * U);
  assert.equal(result.blocker, null);
  assert.equal(orderLimits({ ...base, notes: [note(0, 4), note(5, 1)], amount: 5n * U }).blocker, "short");
});

test("empty balance", () => {
  assert.equal(orderLimits({ ...base, notes: [], amount: 10n * U }).blocker, "empty");
});

test("approved deposit paying for an open order", () => {
  const result = orderLimits({ ...base, notes: [note(2, 25)], openOrders: [{ id: "R-ABC123", depositIndex: "2" }], amount: 10n * U });
  assert.equal(result.maxSpend, 0n);
  assert.equal(result.blocker, "busy");
  assert.equal(result.busyOrderId, "R-ABC123");
});

test("waiting for the clean-funds check", () => {
  assert.equal(orderLimits({ ...base, notes: [note(3, 25, "waiting")], amount: 10n * U }).blocker, "waiting");
});

test("none approved", () => {
  assert.equal(orderLimits({ ...base, notes: [note(3, 25, "rejected")], amount: 10n * U }).blocker, "none");
});

test("too small for the pieces", () => {
  assert.equal(orderLimits({ ...base, notes: [note(0, 25)], amount: 2n * U }).blocker, "small");
});
