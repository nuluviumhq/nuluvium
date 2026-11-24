import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMON_DEPOSIT_SIZES, depositSizeAdvice } from "../src/sizes.ts";

const usdg = (whole: number) => BigInt(Math.round(whole * 1_000_000));

test("a common size needs no split", () => {
  for (const size of COMMON_DEPOSIT_SIZES) {
    const advice = depositSizeAdvice(size);
    assert.equal(advice.common, true);
    assert.deepEqual(advice.split, [size]);
    assert.equal(advice.rest, 0n);
  }
});

test("an odd amount splits into common sizes, largest first, with the rest left out", () => {
  const advice = depositSizeAdvice(usdg(137.42));
  assert.equal(advice.common, false);
  assert.deepEqual(advice.split, [usdg(100), usdg(25), usdg(10)]);
  assert.equal(advice.rest, usdg(2.42));
});

test("above the cap and below the smallest size", () => {
  assert.deepEqual(depositSizeAdvice(usdg(1260)).split, [usdg(1000), usdg(250), usdg(10)]);
  const small = depositSizeAdvice(usdg(7));
  assert.deepEqual(small.split, []);
  assert.equal(small.rest, usdg(7));
});
