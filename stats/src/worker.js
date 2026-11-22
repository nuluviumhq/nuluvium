// Nuluvium stats Worker (Robinhood Chain testnet). Public numbers only, totals over everyone.
//   cron (every 10 min): reads new pool and Router events since the last run (one eth_getLogs per
//          10,000 blocks), adds them to running totals in KV (src/totals.js), then computes the
//          summary with the current pool balance, the ASP's approved set and the relayer's fee and
//          gas balance.
//   GET /stats   the latest summary (JSON, amounts as decimal strings in token units)
//
// Never logs viem's error.message: it contains the RPC URL with its key.

import { createPublicClient, defineChain, http, parseAbi, parseAbiItem } from "viem";
import { toJson } from "./aggregate.js";
import { addEvent, emptyTotals, fromEvents, prune, summarize } from "./totals.js";

const EVENTS = [
  parseAbiItem("event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)"),
  parseAbiItem("event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)"),
  parseAbiItem("event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)"),
  parseAbiItem(
    "event Swapped(address indexed owner, uint256 indexed nonce, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, address feeRecipient)",
  ),
];
const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

// Alchemy allows 10,000 blocks per eth_getLogs. The free Workers plan allows 50 outgoing requests
// per run, so a run reads at most 35 chunks (350,000 blocks, about 10 hours of this chain) and
// leaves room for the balance, ASP and relayer reads. A long gap is caught up over several runs.
const LOG_CHUNK = 10_000n;
const MAX_CHUNKS_PER_RUN = 35n;
// `events` is the old list of every event (read once for the migration); `totals` replaced it.
const EVENTS_KEY = "events";
const TOTALS_KEY = "totals";
const SUMMARY_KEY = "summary";

const rpcUrl = (env) => env.PRIVATE_RPC_URL || env.RPC_URL;

function clientFor(env) {
  const chain = defineChain({
    id: Number(env.CHAIN_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl(env)] } },
  });
  return createPublicClient({ chain, transport: http(rpcUrl(env), { timeout: 20_000, retryCount: 1 }) });
}

/**
 * Running totals (src/totals.js). On the first run after the switch, the old `events` value is
 * folded into totals once; that key is left in KV untouched and is no longer read after that.
 */
async function loadTotals(env, now) {
  const saved = await env.STATS.get(TOTALS_KEY, "json");
  if (saved) return { totals: saved, migrated: false };
  const old = await env.STATS.get(EVENTS_KEY, "json");
  if (old) return { totals: fromEvents(old, { usdg: env.USDG, now }), migrated: true };
  return { totals: emptyTotals(BigInt(env.DEPLOY_BLOCK) - 1n), migrated: false };
}

/** Reads events from the block after the last run, up to the chunk limit, into the totals. */
async function scan(client, env, now) {
  const { totals, migrated } = await loadTotals(env, now);
  const context = { usdg: env.USDG, now };
  const lastBlock = BigInt(totals.lastBlock);

  const latest = await client.getBlockNumber();
  const limit = lastBlock + LOG_CHUNK * MAX_CHUNKS_PER_RUN;
  const scanUntil = latest < limit ? latest : limit;
  for (let from = lastBlock + 1n; from <= scanUntil; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < scanUntil ? from + LOG_CHUNK - 1n : scanUntil;
    const logs = await client.getLogs({ address: [env.POOL, env.ROUTER], events: EVENTS, fromBlock: from, toBlock: to });
    for (const log of logs) {
      // The RPC returns the block time with each log (blockTimestamp); seconds since 1970.
      const time = Number(log.blockTimestamp ?? 0n);
      const pool = log.address.toLowerCase() === env.POOL.toLowerCase();
      if (pool && log.eventName === "Deposited") {
        addEvent(totals, { type: "deposit", label: log.args._label, depositor: log.args._depositor, value: log.args._value }, context);
      } else if (pool && log.eventName === "Withdrawn") addEvent(totals, { type: "withdrawal", value: log.args._value }, context);
      else if (pool && log.eventName === "Ragequit") addEvent(totals, { type: "ragequit", value: log.args._value }, context);
      else if (!pool && log.eventName === "Swapped") {
        const { tokenIn, tokenOut, amountIn, amountOut, fee } = log.args;
        addEvent(totals, { type: "swap", tokenIn, tokenOut, amountIn, amountOut, fee, time }, context);
      }
    }
  }
  // The cursor and the totals are one KV value, so a run either counts a block range or it does not.
  totals.lastBlock = scanUntil.toString();
  prune(totals, now);
  await env.STATS.put(TOTALS_KEY, JSON.stringify(totals));
  return { totals, latest, caughtUp: scanUntil === latest, migrated };
}

/** The ASP's approved set (labels and rejections). Null when it cannot be read right now. */
async function readApprovedSet(env) {
  try {
    const status = await (await fetch(`${env.ASP_URL}/`)).json();
    const cid = status.latest?.cid;
    if (!cid) return null;
    const document = await (await fetch(`${env.ASP_URL}/sets/${cid}`)).json();
    return { labels: document.approvedLabels.map(BigInt), rejected: document.rejected };
  } catch {
    return null;
  }
}

async function runOnce(env) {
  const client = clientFor(env);
  const now = Math.floor(Date.now() / 1000);
  const { totals: running, latest, caughtUp, migrated } = await scan(client, env, now);
  // Every relayer in RELAYER_URLS (comma-separated, main first): its quote names its address and fee.
  const relayerUrls = (env.RELAYER_URLS ?? env.RELAYER_URL ?? "").split(",").map((url) => url.trim()).filter(Boolean);
  const [approvedSet, ...quotes] = await Promise.all([
    readApprovedSet(env),
    ...relayerUrls.map((url) => fetch(`${url}/quote`).then((response) => response.json()).catch(() => null)),
  ]);
  const [poolUsdg, ...relayerEth] = await Promise.all([
    client.readContract({ address: env.USDG, abi: erc20Abi, functionName: "balanceOf", args: [env.POOL] }),
    ...quotes.map((entry) => (entry?.relayer ? client.getBalance({ address: entry.relayer }) : Promise.resolve(null))),
  ]);
  const quote = quotes.find((entry) => entry?.fee) ?? null;
  const relayers = relayerUrls.map((url, index) => ({ url, name: quotes[index]?.name ?? null, address: quotes[index]?.relayer ?? null, ethBalance: relayerEth[index] ?? null }));

  const symbols = JSON.parse(env.TOKEN_SYMBOLS);
  const totals = summarize(running, { symbols, approvedSet, now });
  const summary = toJson({
    network: "Robinhood Chain testnet",
    updatedAt: now,
    block: latest,
    scannedTo: running.lastBlock,
    caughtUp,
    poolUsdg,
    ...totals,
    // ethBalance stays the main relayer's for older readers; relayers lists each one.
    relayer: { ...totals.relayer, currentFee: quote?.fee ?? null, ethBalance: relayerEth[0] ?? null, relayers },
    // Ready-to-show numbers for badges (shields.io cannot divide raw token units).
    headline: {
      approvedDeposits: totals.crowd.approvedDeposits,
      piecesRouted: totals.routed.all.pieces,
      shieldedUsdg: Math.round(Number(poolUsdg) / 1e6).toLocaleString("en-US"),
      routedUsdg: Math.round(Number(totals.routed.all.usdg) / 1e6).toLocaleString("en-US"),
    },
  });
  await env.STATS.put(SUMMARY_KEY, JSON.stringify(summary));
  return { block: latest.toString(), caughtUp, migrated, deposits: running.deposits.length, swaps: running.relayer.swaps, buckets: running.buckets.length };
}

const CORS = { "access-control-allow-origin": "*" };
const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runOnce(env).then(
        (result) => console.log(JSON.stringify(result)),
        (error) => console.error(`stats run failed: ${error.shortMessage ?? error.name}${error.details ? ` (${error.details})` : ""}`),
      ),
    );
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (pathname === "/" || pathname === "/stats") {
      const summary = await env.STATS.get(SUMMARY_KEY, "json");
      if (!summary) return json({ error: "no summary yet; the first run has not finished" }, 503);
      return json(summary, 200, { "cache-control": "public, max-age=60" });
    }
    return json({ error: "not found" }, 404);
  },
};
