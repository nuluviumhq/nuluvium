import assert from "node:assert/strict";
import { test } from "node:test";
import { DRIP_ETH, DRIP_USDG, PER_DAY_TOTAL, PER_VISITOR_PER_DAY, RESERVE_ETH, Refusal, checkLimits, dayOf, plan, walletFrom } from "../src/rules.js";

test("only wallet addresses are accepted, returned checksummed", () => {
  assert.equal(walletFrom({ address: "0x7dd369a7e4c986f5d6336ca6034bc7b47a6fdd73" }), "0x7dd369A7e4C986F5D6336Ca6034Bc7B47a6fdD73");
  for (const body of [{}, { address: "0x123" }, { address: "nuluvium.eth" }, null]) {
    assert.throws(() => walletFrom(body), Refusal);
  }
});

test("an empty wallet gets ETH and USDG; a funded one only USDG", () => {
  const faucetEth = RESERVE_ETH + 10n * DRIP_ETH;
  assert.deepEqual(plan({ walletEth: 0n, faucetEth }), { eth: DRIP_ETH, usdg: DRIP_USDG });
  assert.deepEqual(plan({ walletEth: DRIP_ETH, faucetEth }), { eth: 0n, usdg: DRIP_USDG });
});

test("the faucet keeps its reserve and points to the official faucet when dry", () => {
  assert.throws(() => plan({ walletEth: 0n, faucetEth: RESERVE_ETH + DRIP_ETH - 1n }), (error) => error instanceof Refusal && error.status === 503 && /official faucet/.test(error.message));
  // A wallet that needs no ETH is still served from a dry faucet (minting costs only the faucet's gas).
  assert.deepEqual(plan({ walletEth: DRIP_ETH, faucetEth: 0n }), { eth: 0n, usdg: DRIP_USDG });
});

test("daily limits: once per wallet, a few per visitor, a total cap", () => {
  assert.doesNotThrow(() => checkLimits({ walletUsedToday: false, visitorCountToday: PER_VISITOR_PER_DAY - 1, totalToday: PER_DAY_TOTAL - 1 }));
  assert.throws(() => checkLimits({ walletUsedToday: true, visitorCountToday: 0, totalToday: 0 }), /already got test funds today/);
  assert.throws(() => checkLimits({ walletUsedToday: false, visitorCountToday: PER_VISITOR_PER_DAY, totalToday: 0 }), /your connection/);
  assert.throws(() => checkLimits({ walletUsedToday: false, visitorCountToday: 0, totalToday: PER_DAY_TOTAL }), /today's limit/);
});

test("days are UTC dates", () => {
  assert.equal(dayOf(1_795_000_000), "2026-11-18");
});
