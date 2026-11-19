// Nuluvium stats Worker (Robinhood Chain testnet). Public numbers only, totals over everyone.
//   cron (every 10 min): reads new pool and Router events since the last run (one eth_getLogs per
//          10,000 blocks), keeps them in KV, then computes the summary with the current pool
//          balance, the ASP's approved set and the relayer's fee and gas balance.
//   GET /stats   the latest summary (JSON, amounts as decimal strings in token units)
//
// Never logs viem's error.message: it contains the RPC URL with its key.

import { createPublicClient, defineChain, http, parseAbi, parseAbiItem } from "viem";
import { aggregate, toJson } from "./aggregate.js";

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
const EVENTS_KEY = "events";
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

/** Stored events (amounts as strings in KV) → bigint values for aggregate(). */
function revive(saved) {
  const big = (list, keys) => list.map((item) => ({ ...item, ...Object.fromEntries(keys.map((key) => [key, BigInt(item[key])])) }));
  return {
    lastBlock: BigInt(saved.lastBlock),
    deposits: big(saved.deposits, ["label", "value"]),
    withdrawals: big(saved.withdrawals, ["value"]),
    ragequits: big(saved.ragequits, ["value"]),
    swaps: big(saved.swaps, ["amountIn", "amountOut", "fee"]),
  };
}

/** Reads events from the block after the last run, up to the chunk limit. */
async function scan(client, env) {
  const saved = await env.STATS.get(EVENTS_KEY, "json");
  const state = saved
    ? revive(saved)
    : { lastBlock: BigInt(env.DEPLOY_BLOCK) - 1n, deposits: [], withdrawals: [], ragequits: [], swaps: [] };

  const latest = await client.getBlockNumber();
  const limit = state.lastBlock + LOG_CHUNK * MAX_CHUNKS_PER_RUN;
  const scanUntil = latest < limit ? latest : limit;
  for (let from = state.lastBlock + 1n; from <= scanUntil; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < scanUntil ? from + LOG_CHUNK - 1n : scanUntil;
    const logs = await client.getLogs({ address: [env.POOL, env.ROUTER], events: EVENTS, fromBlock: from, toBlock: to });
    for (const log of logs) {
      // The RPC returns the block time with each log (blockTimestamp); seconds since 1970.
      const time = Number(log.blockTimestamp ?? 0n);
      const pool = log.address.toLowerCase() === env.POOL.toLowerCase();
      if (pool && log.eventName === "Deposited") state.deposits.push({ label: log.args._label, depositor: log.args._depositor, value: log.args._value, time });
      else if (pool && log.eventName === "Withdrawn") state.withdrawals.push({ value: log.args._value, time });
      else if (pool && log.eventName === "Ragequit") state.ragequits.push({ value: log.args._value, time });
      else if (!pool && log.eventName === "Swapped") {
        const { tokenIn, tokenOut, amountIn, amountOut, fee } = log.args;
        state.swaps.push({ tokenIn, tokenOut, amountIn, amountOut, fee, time });
      }
    }
  }
  state.lastBlock = scanUntil;
  await env.STATS.put(EVENTS_KEY, JSON.stringify(toJson(state)));
  return { state, latest, caughtUp: scanUntil === latest };
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
  const { state, latest, caughtUp } = await scan(client, env);
  const [approvedSet, quote] = await Promise.all([readApprovedSet(env), fetch(`${env.RELAYER_URL}/quote`).then((response) => response.json()).catch(() => null)]);
  const [poolUsdg, relayerEth] = await Promise.all([
    client.readContract({ address: env.USDG, abi: erc20Abi, functionName: "balanceOf", args: [env.POOL] }),
    quote?.relayer ? client.getBalance({ address: quote.relayer }) : Promise.resolve(null),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const symbols = JSON.parse(env.TOKEN_SYMBOLS);
  const totals = aggregate({ ...state, usdg: env.USDG, symbols, approvedSet, now });
  const summary = toJson({
    network: "Robinhood Chain testnet",
    updatedAt: now,
    block: latest,
    scannedTo: state.lastBlock,
    caughtUp,
    poolUsdg,
    ...totals,
    relayer: { ...totals.relayer, currentFee: quote?.fee ?? null, ethBalance: relayerEth },
    // Ready-to-show numbers for badges (shields.io cannot divide raw token units).
    headline: {
      approvedDeposits: totals.crowd.approvedDeposits,
      piecesRouted: totals.routed.all.pieces,
      shieldedUsdg: Math.round(Number(poolUsdg) / 1e6).toLocaleString("en-US"),
      routedUsdg: Math.round(Number(totals.routed.all.usdg) / 1e6).toLocaleString("en-US"),
    },
  });
  await env.STATS.put(SUMMARY_KEY, JSON.stringify(summary));
  return { block: latest.toString(), caughtUp, deposits: state.deposits.length, swaps: state.swaps.length };
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
