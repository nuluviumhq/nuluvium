import assert from "node:assert/strict";
import { test } from "node:test";
import { alertDue, floatAlert, formatEth } from "../src/alert.js";

const base = {
  name: "relayer 2",
  address: "0x0000000000000000000000000000000000000001",
  alertBelow: 1_500_000_000_000_000n,
  refuseBelow: 500_000_000_000_000n,
  gasPerPiece: 900_000n,
  gasPrice: 10_000_000n, // 0.01 gwei: 0.000009 ETH per piece
};

test("formatEth", () => {
  assert.equal(formatEth(1_234_567_000_000_000n), "0.001234");
  assert.equal(formatEth(2n * 10n ** 18n), "2.000000");
});

test("no alert above the line", () => {
  assert.equal(floatAlert({ ...base, balance: 1_500_000_000_000_000n }), null);
});

test("alert below the line says how many pieces are left", () => {
  const text = floatAlert({ ...base, balance: 1_400_000_000_000_000n });
  assert.match(text, /0\.001400 ETH/);
  assert.match(text, /About 100 more pieces/);
});

test("alert below the refuse line says pieces are refused", () => {
  assert.match(floatAlert({ ...base, balance: 400_000_000_000_000n }), /refusing pieces now/);
});

test("alerts at most once per period", () => {
  assert.equal(alertDue(undefined, 0, 12), true);
  assert.equal(alertDue(0, 11 * 3_600_000, 12), false);
  assert.equal(alertDue(0, 12 * 3_600_000, 12), true);
});
