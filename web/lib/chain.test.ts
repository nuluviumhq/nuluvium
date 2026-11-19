// Run: node --test lib/chain.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUsdg, parseUsdg } from "./chain.ts";

test("parseUsdg reads amounts with up to 6 decimals", () => {
  assert.equal(parseUsdg("12"), 12_000_000n);
  assert.equal(parseUsdg("12.5"), 12_500_000n);
  assert.equal(parseUsdg(" 0.000001 "), 1n);
  assert.equal(parseUsdg("1000.10"), 1_000_100_000n);
});

test("parseUsdg refuses zero, negatives, junk and too many decimals", () => {
  for (const text of ["0", "0.0", "-1", "1e3", "abc", "", "1.0000001", "1,000", "."]) assert.equal(parseUsdg(text), null, text);
});

test("formatUsdg shows two decimals with thousands separators", () => {
  assert.equal(formatUsdg(1_234_500_000n), "1,234.50");
  assert.equal(formatUsdg(9_950_000n), "9.95");
  assert.equal(formatUsdg(0n), "0.00");
});
