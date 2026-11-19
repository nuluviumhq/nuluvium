// What the /api/rpc proxy (app/api/rpc/route.ts) accepts. Pure, so it runs under node --test.
//
// Origin: browsers send it, so other websites cannot use the proxy (and our RPC quota) from their
// pages. A request with no Origin, or from a browser extension, is allowed on purpose: wallet
// extensions (MetaMask, Rabby…) add our chain with this proxy as its RPC and call it from their own
// background, not from our page. A server can leave the header out anyway, so the method, log and
// size limits below are what actually bound the cost.

export const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_estimateGas",
  "net_version",
  // Signed by the wallet before it reaches us; we only pass it on.
  "eth_sendRawTransaction",
]);
export const MAX_BATCH = 20;
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_LOG_RANGE = 10_000n; // Alchemy's limit for eth_getLogs

/**
 * Contracts whose logs are served: the pool, the Router, and the Entrypoint for its RootUpdated
 * events (the SDK reads the latest approved-set CID from them when the ASP's status lags the chain).
 * Passed in by the route, so this file needs no SDK import and runs under node --test.
 */
export const logAddresses = (config: { pool: string; router: string; entrypoint: string }) =>
  new Set([config.pool, config.router, config.entrypoint].map((address) => address.toLowerCase()));

/** Web pages allowed to call the proxy from a browser, besides the site itself. */
const PARTNER_ORIGINS = new Set(["https://auth.privy.io"]); // Privy's embedded wallet runs in its iframe
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\//;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Null when the Origin may call the proxy; otherwise why not. */
export function originRefusal(origin: string | null, siteOrigin: string): string | null {
  if (origin === null || origin === "null") return null;
  if (origin === siteOrigin || PARTNER_ORIGINS.has(origin) || EXTENSION_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin)) return null;
  return "this RPC only serves the Nuluvium app and wallets";
}

export interface RpcCall {
  jsonrpc?: string;
  id?: number | string | null;
  method?: unknown;
  params?: unknown;
}

const blockNumber = (value: unknown): bigint | null => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,16}$/.test(value)) return null;
  return BigInt(value);
};

/** Null when a call may go upstream; otherwise why not. */
export function callRefusal(call: RpcCall, allowedLogAddresses: Set<string>): string | null {
  if (typeof call.method !== "string" || !ALLOWED_METHODS.has(call.method)) return "method not allowed";
  if (call.method === "eth_getLogs") {
    const [filter] = (Array.isArray(call.params) ? call.params : []) as Array<{ address?: unknown; fromBlock?: unknown; toBlock?: unknown }>;
    const address = typeof filter?.address === "string" ? filter.address.toLowerCase() : "";
    if (!allowedLogAddresses.has(address)) return "logs are only served for the Nuluvium pool, Router and Entrypoint";
    const from = blockNumber(filter?.fromBlock);
    const to = blockNumber(filter?.toBlock);
    if (from === null || to === null) return "logs need explicit hex fromBlock and toBlock";
    if (to < from || to - from >= MAX_LOG_RANGE) return "log range too large";
  }
  return null;
}
