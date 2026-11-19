// Nuluvium testnet faucet (faucet.nuluvium.com).
//   GET  /        status: the faucet's address and how much ETH it has left
//   POST /drip    { address } → a little test ETH (when the wallet has almost none) and 100 test USDG
//
// Testnet only. Limits (faucet/src/rules.js): one drip per wallet per day, 3 per visitor per day,
// 300 per day in total. The limits are kept in KV for a day under two unrelated keys, the wallet
// and a salted hash of the visitor's IP, so nothing records which IP asked for which wallet. No
// request is logged (observability off). Transactions leave one at a time through a Durable
// Object, so their nonces never collide.

import { DurableObject } from "cloudflare:workers";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { isBlockedCountry } from "../../web/lib/geo.ts";
import { DAY_SECONDS, Refusal, checkLimits, dayOf, plan, walletFrom } from "./rules.js";

const usdgAbi = parseAbi(["function mint(address to, uint256 amount)", "function balanceOf(address) view returns (uint256)"]);
const ALLOWED_ORIGINS = /^(https:\/\/(www\.)?nuluvium\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const MAX_BODY_BYTES = 1024;

const rpcUrl = (env) => env.PRIVATE_RPC_URL || env.RPC_URL;

function clientsFor(env) {
  const chain = defineChain({
    id: Number(env.CHAIN_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl(env)] } },
  });
  const transport = http(rpcUrl(env), { timeout: 20_000, retryCount: 1 });
  const account = privateKeyToAccount(env.FAUCET_KEY);
  return { account, publicClient: createPublicClient({ chain, transport }), walletClient: createWalletClient({ chain, transport, account }) };
}

/** Salted SHA-256 of the visitor's IP: enough to count requests, not to recover the IP. */
async function visitorKey(env, ip) {
  const bytes = new TextEncoder().encode(`${env.FAUCET_SALT}:${ip}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class FaucetQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tail = Promise.resolve();
  }

  async fetch(request) {
    const { address, visitor } = await request.json();
    const run = this.tail.then(() => drip(this.env, address, visitor));
    this.tail = run.catch(() => {});
    try {
      return json(await run);
    } catch (error) {
      if (error instanceof Refusal) return json({ error: error.message }, error.status);
      // Never log viem's error.message: it contains the RPC URL with its key.
      console.error(`faucet drip failed: ${error.shortMessage ?? error.name}`);
      return json({ error: "The faucet could not send right now. Try again in a minute." }, 502);
    }
  }
}

async function drip(env, address, visitor) {
  const now = Math.floor(Date.now() / 1000);
  const day = dayOf(now);
  const walletId = `wallet:${address.toLowerCase()}`;
  const visitorId = `visitor:${day}:${visitor}`;
  const totalId = `total:${day}`;
  const [walletUsedToday, visitorCount, total] = await Promise.all([env.FAUCET.get(walletId), env.FAUCET.get(visitorId), env.FAUCET.get(totalId)]);
  checkLimits({ walletUsedToday: Boolean(walletUsedToday), visitorCountToday: Number(visitorCount ?? 0), totalToday: Number(total ?? 0) });

  const { account, publicClient, walletClient } = clientsFor(env);
  const [walletEth, faucetEth] = await Promise.all([publicClient.getBalance({ address }), publicClient.getBalance({ address: account.address })]);
  const amounts = plan({ walletEth, faucetEth });

  const sent = {};
  if (amounts.eth > 0n) sent.ethTx = await walletClient.sendTransaction({ to: address, value: amounts.eth });
  sent.usdgTx = await walletClient.writeContract({ address: env.USDG, abi: usdgAbi, functionName: "mint", args: [address, amounts.usdg] });
  await Promise.all(Object.values(sent).map((hash) => publicClient.waitForTransactionReceipt({ hash })));

  // Count only drips that went out. Separate keys: the wallet and the visitor are never stored together.
  await Promise.all([
    env.FAUCET.put(walletId, "1", { expirationTtl: DAY_SECONDS }),
    env.FAUCET.put(visitorId, String(Number(visitorCount ?? 0) + 1), { expirationTtl: DAY_SECONDS }),
    env.FAUCET.put(totalId, String(Number(total ?? 0) + 1), { expirationTtl: 2 * DAY_SECONDS }),
  ]);
  return { address, eth: formatEther(amounts.eth), usdg: "100", ...sent };
}

const corsFor = (origin) => ({
  "access-control-allow-origin": origin && ALLOWED_ORIGINS.test(origin) ? origin : "https://nuluvium.com",
  "access-control-allow-methods": "GET, POST",
  "access-control-allow-headers": "content-type",
  vary: "origin",
});
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const origin = request.headers.get("origin");
    const cors = corsFor(origin);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "GET" && pathname === "/") {
      const { account, publicClient } = clientsFor(env);
      const balance = await publicClient.getBalance({ address: account.address }).catch(() => null);
      return json({ service: "Nuluvium testnet faucet", faucet: account.address, ethLeft: balance === null ? null : formatEther(balance) }, 200, cors);
    }

    if (request.method === "POST" && pathname === "/drip") {
      if (origin && !ALLOWED_ORIGINS.test(origin)) return json({ error: "The faucet only serves the Nuluvium app." }, 403, cors);
      if (isBlockedCountry(request.headers.get("cf-ipcountry"))) return json({ error: "Nuluvium is not available in your country." }, 451, cors);
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413, cors);
      let address;
      try {
        address = walletFrom(JSON.parse(text || "{}"));
      } catch (error) {
        return json({ error: error instanceof Refusal ? error.message : "invalid JSON" }, 400, cors);
      }
      // Cloudflare's per-visitor burst limit first (nothing stored), then the daily limits in the queue.
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.FAUCET_LIMITER.limit({ key: ip });
      if (!success) return json({ error: "Too many requests, try again in a minute." }, 429, cors);
      const queue = env.FAUCET_QUEUE.get(env.FAUCET_QUEUE.idFromName("faucet"));
      const response = await queue.fetch("https://queue/drip", { method: "POST", body: JSON.stringify({ address, visitor: await visitorKey(env, ip) }) });
      return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...cors } });
    }

    return json({ error: "not found" }, 404, cors);
  },
};
