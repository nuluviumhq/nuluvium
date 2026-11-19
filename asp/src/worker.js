// Nuluvium ASP Worker (Robinhood Chain testnet).
//   cron:  screen every deposit in the USDG pool; if the approved set changed, publish the set
//          document to KV under its CID and post the new root with Entrypoint.updateRoot.
//   GET /            status (latest root, CID, counts)
//   GET /sets/<cid>  the published set document, byte for byte what the CID hashes
//
// Fails closed: if the OFAC list or the issuer check cannot be read, nothing is posted.

import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rawCid } from "./cid.js";
import { REASONS, approvedRoot, screenDeposits } from "./screen.js";

const depositedEvent = parseAbiItem(
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
);
const entrypointAbi = parseAbi([
  "function latestRoot() view returns (uint256)",
  "function updateRoot(uint256 root, string ipfsCID) returns (uint256)",
]);
const registryAbi = parseAbi(["function isBlocked(address account) view returns (bool)"]);

// Alchemy allows at most 10,000 blocks per eth_getLogs. 30 chunks a run catch up 300,000 blocks
// (about 8 hours of this chain) per minute after a pause.
const LOG_CHUNK = 10_000n;
const MAX_CHUNKS_PER_RUN = 30n;
const CURSOR_SAVE_EVERY = 50_000n; // blocks; also saved whenever a new deposit is found
const SCAN_KEY = "scan";
const OFAC_CACHE_KEY = "ofac:eth";
const OFAC_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LATEST_KEY = "latest";

// A dedicated RPC (secret PRIVATE_RPC_URL) is needed in production: the public RPC rate-limits
// Cloudflare's shared outgoing IPs (HTTP 429 on the first call). RPC_URL is the public fallback.
const rpcUrl = (env) => env.PRIVATE_RPC_URL || env.RPC_URL;

function chainFor(env) {
  return defineChain({
    id: Number(env.CHAIN_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl(env)] } },
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  });
}

const addressSet = (text) =>
  new Set(
    (text ?? "")
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => /^0x[0-9a-f]{40}$/.test(entry)),
  );

/** OFAC ETH addresses, refreshed daily; falls back to the last good copy, never to an empty list. */
async function loadSanctioned(env) {
  const cached = await env.ASP_SETS.get(OFAC_CACHE_KEY, "json");
  if (cached && Date.now() - cached.fetchedAt < OFAC_MAX_AGE_MS) return new Set(cached.addresses);

  try {
    const response = await fetch(env.OFAC_LIST_URL, { cf: { cacheTtl: 3600 } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const addresses = [...addressSet(await response.text())];
    if (addresses.length < 50) throw new Error(`only ${addresses.length} addresses, refusing a truncated list`);
    await env.ASP_SETS.put(OFAC_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), addresses }));
    return new Set(addresses);
  } catch (error) {
    if (cached) {
      console.warn(`OFAC refresh failed (${error.message}); using copy from ${new Date(cached.fetchedAt).toISOString()}`);
      return new Set(cached.addresses);
    }
    throw new Error(`OFAC list unavailable and no cached copy: ${error.message}`);
  }
}

/**
 * All deposits so far. Scans only the blocks after the saved cursor, in chunks the RPC accepts, and
 * saves the cursor when new deposits appear or it has moved far enough. That keeps KV writes well
 * under the free tier's daily limit while the cron runs every minute.
 */
async function loadDeposits(publicClient, env) {
  const saved = await env.ASP_SETS.get(SCAN_KEY, "json");
  const deposits = (saved?.deposits ?? []).map((deposit) => ({
    ...deposit,
    label: BigInt(deposit.label),
    value: BigInt(deposit.value),
    blockNumber: BigInt(deposit.blockNumber),
  }));
  const savedBlock = saved ? BigInt(saved.lastBlock) : BigInt(env.DEPLOY_BLOCK) - 1n;

  const latest = await publicClient.getBlockNumber();
  const scanUntil = latest < savedBlock + LOG_CHUNK * MAX_CHUNKS_PER_RUN ? latest : savedBlock + LOG_CHUNK * MAX_CHUNKS_PER_RUN;
  let found = 0;
  for (let from = savedBlock + 1n; from <= scanUntil; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < scanUntil ? from + LOG_CHUNK - 1n : scanUntil;
    const logs = await publicClient.getLogs({ address: env.POOL, event: depositedEvent, fromBlock: from, toBlock: to });
    for (const log of logs) {
      deposits.push({
        label: log.args._label,
        depositor: log.args._depositor,
        value: log.args._value,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        tx: log.transactionHash,
      });
      found += 1;
    }
  }

  if (found > 0 || scanUntil - savedBlock >= CURSOR_SAVE_EVERY) {
    await env.ASP_SETS.put(
      SCAN_KEY,
      JSON.stringify({
        lastBlock: scanUntil.toString(),
        deposits: deposits.map((deposit) => ({
          ...deposit,
          label: deposit.label.toString(),
          value: deposit.value.toString(),
          blockNumber: deposit.blockNumber.toString(),
        })),
      }),
    );
  }
  return deposits;
}

async function loadIssuerBlocked(publicClient, env, depositors) {
  const unique = [...new Set(depositors.map((address) => address.toLowerCase()))];
  if (unique.length === 0) return new Set();
  const results = await publicClient.multicall({
    contracts: unique.map((account) => ({
      address: env.ISSUER_REGISTRY,
      abi: registryAbi,
      functionName: "isBlocked",
      args: [account],
    })),
    allowFailure: false, // one failed read fails the whole run (fail closed)
  });
  return new Set(unique.filter((_, index) => results[index] === true));
}

/** One screening pass. Returns a summary; posts a root only when the approved set changed. */
export async function runOnce(env, { dryRun = false } = {}) {
  const chain = chainFor(env);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl(env), { timeout: 20_000, retryCount: 2 }) });

  const [deposits, sanctioned] = await Promise.all([loadDeposits(publicClient, env), loadSanctioned(env)]);
  const issuerBlocked = await loadIssuerBlocked(publicClient, env, deposits.map((deposit) => deposit.depositor));

  const { approved, rejected, approvedTotal } = screenDeposits(deposits, {
    sanctioned,
    denylist: addressSet(env.DENYLIST),
    issuerBlocked,
    perDepositCap: BigInt(env.PER_DEPOSIT_CAP),
    totalCap: BigInt(env.TOTAL_CAP),
  });

  const root = approvedRoot(approved.map((deposit) => deposit.label));
  const onchainRoot = await publicClient.readContract({ address: env.ENTRYPOINT, abi: entrypointAbi, functionName: "latestRoot" });
  const summary = {
    deposits: deposits.length,
    approved: approved.length,
    rejected: rejected.length,
    approvedTotal: approvedTotal.toString(),
    root: root.toString(),
    onchainRoot: onchainRoot.toString(),
    posted: false,
  };
  if (root === 0n || root === onchainRoot || dryRun) return summary;

  // The published document: what was approved, what was not and why, under which rules.
  const document = {
    version: 1,
    chainId: chain.id,
    pool: env.POOL,
    root: root.toString(),
    rules: {
      perDepositCap: env.PER_DEPOSIT_CAP,
      totalCap: env.TOTAL_CAP,
      checks: Object.values(REASONS),
      ofacSource: env.OFAC_LIST_URL,
      ofacAddresses: sanctioned.size,
    },
    approvedLabels: approved.map((deposit) => deposit.label.toString()),
    rejected: rejected.map(({ deposit, reason }) => ({ label: deposit.label.toString(), tx: deposit.tx, reason })),
    createdAt: new Date().toISOString(),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(document, null, 2));
  const cid = await rawCid(bytes);
  await env.ASP_SETS.put(`set:${cid}`, bytes);

  const account = privateKeyToAccount(env.POSTMAN_KEY);
  const walletClient = createWalletClient({ chain, transport: http(rpcUrl(env)), account });
  const hash = await walletClient.writeContract({
    address: env.ENTRYPOINT,
    abi: entrypointAbi,
    functionName: "updateRoot",
    args: [root, cid],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`updateRoot reverted: ${hash}`);

  await env.ASP_SETS.put(LATEST_KEY, JSON.stringify({ cid, root: root.toString(), tx: hash, postedAt: document.createdAt }));
  return { ...summary, posted: true, cid, tx: hash };
}

// Public data, read by the web app from any origin.
const CORS = { "access-control-allow-origin": "*" };
const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runOnce(env).then(
        (summary) => console.log(JSON.stringify(summary)),
        // Never log error.message: viem puts the full RPC URL (with its key) in it.
        (error) => console.error(`ASP run failed: ${error.shortMessage ?? error.name}${error.details ? ` (${error.details})` : ""}`),
      ),
    );
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);

    if (pathname === "/") {
      const latest = await env.ASP_SETS.get(LATEST_KEY, "json");
      return json({ service: "Nuluvium ASP (testnet)", chainId: Number(env.CHAIN_ID), pool: env.POOL, latest });
    }

    const match = pathname.match(/^\/sets\/(b[a-z2-7]{58})$/);
    if (match) {
      const bytes = await env.ASP_SETS.get(`set:${match[1]}`, "arrayBuffer");
      if (!bytes) return json({ error: "unknown set" }, 404);
      return new Response(bytes, {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", ...CORS },
      });
    }

    return json({ error: "not found" }, 404);
  },
};
