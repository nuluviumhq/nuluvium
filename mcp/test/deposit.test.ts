import assert from "node:assert/strict";
import { test } from "node:test";
import { DEPOSIT_CAP, MIN_GAS_WEI, depositProblem, formatUsdg } from "../src/deposit.ts";

const wallet = "0x0000000000000000000000000000000000000001";
const funded = { usdg: 2_000n * 1_000_000n, eth: MIN_GAS_WEI };

test("a funded deposit inside the caps can go ahead", () => {
  assert.equal(depositProblem(5_000_000n, funded, wallet), null);
  assert.equal(depositProblem(DEPOSIT_CAP, funded, wallet), null);
});

test("amounts outside the caps are refused", () => {
  assert.match(depositProblem(999_999n, funded, wallet)!, /smallest deposit is 1 USDG/);
  assert.match(depositProblem(DEPOSIT_CAP + 1n, funded, wallet)!, /capped at 1,000 USDG/);
});

test("an underfunded wallet gets told what to send and where", () => {
  const noUsdg = depositProblem(5_000_000n, { usdg: 2_500_000n, eth: MIN_GAS_WEI }, wallet)!;
  assert.match(noUsdg, /holds 2\.5 USDG, less than 5\./);
  assert.ok(noUsdg.includes(wallet));
  const noGas = depositProblem(5_000_000n, { usdg: funded.usdg, eth: 0n }, wallet, "https://faucet.example")!;
  assert.match(noGas, /no ETH for gas/);
  assert.ok(noGas.includes("https://faucet.example"));
});

test("USDG units format without trailing zeros", () => {
  assert.equal(formatUsdg(5_000_000n), "5");
  assert.equal(formatUsdg(2_500_000n), "2.5");
  assert.equal(formatUsdg(1n), "0.000001");
});
