import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicClient } from "viem";
import { ROBINHOOD_TESTNET } from "../src/config.ts";
import { quoteSwap, quotedBuy, quotedSellMinimum, withSlippage } from "../src/quote.ts";

const config = ROBINHOOD_TESTNET;
const STOCK = "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088" as const;

/** Fake chain: the Router lists STOCK at `tier`; the quoter prices 1 stock (1e18) at 180 USDG. */
function fakeClient(tier: number) {
  const quotes: Array<{ tokenIn: string; fee: number; amountIn: bigint }> = [];
  const client = {
    readContract: async () => tier,
    simulateContract: async ({ args }: { args: [{ tokenIn: string; amountIn: bigint; fee: number }] }) => {
      const [{ tokenIn, amountIn, fee }] = args;
      quotes.push({ tokenIn, fee, amountIn });
      const out = tokenIn === config.usdg ? (amountIn * 10n ** 18n) / 180_000_000n : (amountIn * 180_000_000n) / 10n ** 18n;
      return { result: [out, 0n, 0, 0n] };
    },
  } as unknown as PublicClient;
  return { client, quotes };
}

test("withSlippage rounds down and rejects silly values", () => {
  assert.equal(withSlippage(1_000n, 100), 990n);
  assert.equal(withSlippage(999n, 100), 989n);
  assert.throws(() => withSlippage(1n, 10_000));
  assert.throws(() => withSlippage(1n, 1.5));
});

test("quoteSwap quotes at the Router's tier", async () => {
  const { client, quotes } = fakeClient(500);
  assert.equal(await quoteSwap(client, config, config.usdg, STOCK, 18_000_000n), 10n ** 17n);
  assert.equal(quotes[0]!.fee, 500);
});

test("quoteSwap refuses a token the Router does not list", async () => {
  const { client } = fakeClient(0);
  await assert.rejects(quoteSwap(client, config, config.usdg, STOCK, 1n), /not listed/);
});

test("quotedBuy asks for a new quote for every piece", async () => {
  const { client, quotes } = fakeClient(500);
  const target = quotedBuy(client, config, STOCK, 100);
  assert.equal(await target.minAmountOut(18_000_000n), (10n ** 17n * 99n) / 100n);
  await target.minAmountOut(36_000_000n);
  assert.equal(quotes.length, 2);
});

test("quotedSellMinimum leaves room for twice the fee", async () => {
  const { client } = fakeClient(500);
  const { quoted, minimum } = await quotedSellMinimum(client, config, STOCK, 10n ** 17n, 100_000n, 100);
  assert.equal(quoted, 18_000_000n);
  assert.equal(minimum, 17_820_000n - 200_000n);
});
