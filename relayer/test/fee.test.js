import assert from "node:assert/strict";
import { test } from "node:test";
import { quoteFee } from "../src/fee.js";

const base = { gasPerPiece: 900_000n, ethUsdCents: 300_000n, marginPercent: 120n, minimumFee: 100_000n };

test("minimum fee applies at Robinhood Chain gas prices", () => {
  // 900k gas × 0.01 gwei = 9e12 wei = 0.000009 ETH ≈ $0.027, × 1.2 ≈ $0.0324 → minimum $0.10
  const { fee, gasCost } = quoteFee({ ...base, gasPriceWei: 10_000_000n });
  assert.equal(gasCost, 32_400n);
  assert.equal(fee, 100_000n);
});

test("gas cost wins when gas is expensive", () => {
  // 900k gas × 1 gwei = 0.0009 ETH = $2.70, × 1.2 = $3.24
  const { fee } = quoteFee({ ...base, gasPriceWei: 1_000_000_000n });
  assert.equal(fee, 3_240_000n);
});

test("rounds up so the relayer never under-charges", () => {
  const { gasCost } = quoteFee({ ...base, gasPerPiece: 1n, gasPriceWei: 1n, minimumFee: 0n });
  assert.equal(gasCost, 1n);
});
