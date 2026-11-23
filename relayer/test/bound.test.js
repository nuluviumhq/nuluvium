import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMinimum } from "../src/bound.js";
import { BadRequest } from "../src/parse.js";

const base = { maxSlippageBps: 500n, maxFee: 200_000n, protocolFeeBps: 10n };

test("buy: a minimum within 5% of the quote passes", () => {
  assert.equal(checkMinimum({ ...base, isBuy: true, quoted: 1_000_000n, minAmountOut: 990_000n }), 950_000n);
  assert.doesNotThrow(() => checkMinimum({ ...base, isBuy: true, quoted: 1_000_000n, minAmountOut: 950_000n }));
});

test("buy: a minimum more than 5% below the quote is refused", () => {
  assert.throws(() => checkMinimum({ ...base, isBuy: true, quoted: 1_000_000n, minAmountOut: 949_999n }), BadRequest);
});

test("sell: the bound counts the relayer and protocol fee room the order leaves", () => {
  // 18 USDG quoted; client asks 1% slippage less twice a 0.10 fee less 0.1%: 17.82 − 0.20 − 0.018.
  assert.doesNotThrow(() => checkMinimum({ ...base, isBuy: false, quoted: 18_000_000n, minAmountOut: 17_602_000n }));
  // 17.10 is the floor; 16.882 + 0.20 + 0.018 is the lowest signed minimum that passes.
  assert.equal(checkMinimum({ ...base, isBuy: false, quoted: 18_000_000n, minAmountOut: 16_882_000n }), 16_882_000n);
  assert.throws(() => checkMinimum({ ...base, isBuy: false, quoted: 18_000_000n, minAmountOut: 16_881_999n }), /below the current quote/);
});
