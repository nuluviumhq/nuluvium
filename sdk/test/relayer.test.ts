import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ROBINHOOD_TESTNET } from "../src/config.ts";
import { getQuote, markRelayerFailed, markRelayerOk, relayerOrder, sendSell, type Order, type Quote } from "../src/relayer.ts";

const A = "https://relayer-a.test";
const B = "https://relayer-b.test";
const config = { ...ROBINHOOD_TESTNET, relayerUrls: [A, B] };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  markRelayerOk(A);
  markRelayerOk(B);
});

/** Fake relayers: `down` do not answer, `refuse` answer 422 to sends; records every request. */
function serveRelayers({ down = [] as string[], refuse = [] as string[], fees = {} as Record<string, string> } = {}) {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const base = url.replace(/\/(quote|piece|sell)$/, "");
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (down.includes(base)) throw new TypeError("fetch failed");
    if (url.endsWith("/quote")) {
      return new Response(JSON.stringify({ router: config.router, relayer: "0x0000000000000000000000000000000000000001", fee: fees[base] ?? "100000", gasCost: "1" }));
    }
    if (refuse.includes(base)) return new Response(JSON.stringify({ error: "relayer gas float too low; try later" }), { status: 422 });
    return new Response(JSON.stringify({ tx: `0x${"ab".repeat(32)}`, gasUsed: "1" }));
  }) as typeof fetch;
  return calls;
}

const order: Order = {
  owner: "0x0000000000000000000000000000000000000002",
  tokenIn: config.usdg,
  tokenOut: config.usdg,
  amountIn: 1n,
  minAmountOut: 1n,
  maxFee: 200_000n,
  nonce: 1n,
  deadline: 1n,
};
const permit = { deadline: "1", v: "27", r: "0x01" as const, s: "0x02" as const };
const quoteOf = (url: string): Quote => ({ url, router: config.router, relayer: "0x0000000000000000000000000000000000000001", fee: 100_000n, gasCost: 1n });

test("relayerOrder shuffles and puts recently failed relayers last", () => {
  assert.deepEqual(relayerOrder([A, B], { random: () => 0 }), [B, A]);
  assert.deepEqual(relayerOrder([A, B], { random: () => 0.99 }), [A, B]);
  markRelayerFailed(A, 1_000);
  assert.deepEqual(relayerOrder([A, B], { random: () => 0.99, now: 1_000 + 60_000 }), [B, A]);
  // Two minutes later A is back in the random order.
  assert.deepEqual(relayerOrder([A, B], { random: () => 0.99, now: 1_000 + 120_001 }), [A, B]);
});

test("getQuote skips a relayer that is down", async () => {
  serveRelayers({ down: [A] });
  for (let i = 0; i < 4; i++) assert.equal((await getQuote(config)).url, B);
});

test("getQuote fails when every relayer is down", async () => {
  serveRelayers({ down: [A, B] });
  await assert.rejects(getQuote(config), /no relayer answered/);
});

test("a refused send goes to the other relayer with the same signatures and its own fee", async () => {
  const calls = serveRelayers({ refuse: [A], fees: { [B]: "120000" } });
  const sent = await sendSell(config, quoteOf(A), { order, orderSignature: "0x99", permit });
  assert.equal(sent.relayerUrl, B);
  assert.equal(sent.fee, 120_000n);
  const sends = calls.filter((call) => call.url.endsWith("/sell"));
  assert.deepEqual(sends.map((call) => call.url), [`${A}/sell`, `${B}/sell`]);
  assert.equal(sends[0]!.body!.orderSignature, sends[1]!.body!.orderSignature);
  assert.equal(sends[1]!.body!.fee, "120000");
});

test("the other relayer is not used when its fee is above the signed maximum", async () => {
  serveRelayers({ refuse: [A], fees: { [B]: "300000" } });
  await assert.rejects(sendSell(config, quoteOf(A), { order, orderSignature: "0x99", permit }), /above the signed maximum/);
});
