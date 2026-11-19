// JSON-RPC proxy for the browser. The app reads Robinhood Chain only through here:
// - some ISPs block *.robinhood.com, and the public RPC rate-limits shared IPs;
// - the RPC key (PRIVATE_RPC_URL, a Worker secret) never reaches the browser.
// Read methods, plus broadcasting transactions the person's wallet already signed (the app adds this
// proxy as the wallet's RPC for the testnet, since some ISPs block the public one). Logs only for our
// pool, Router and Entrypoint. Nothing is stored or logged here.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isBlockedCountry } from "@/lib/geo";
// The config entry only: the full SDK pulls in snarkjs/WebAssembly, which Workers cannot compile.
import { ROBINHOOD_TESTNET } from "@nuluvium/sdk/config";
import { MAX_BATCH, MAX_BODY_BYTES, callRefusal, logAddresses, originRefusal, type RpcCall } from "@/lib/rpcPolicy";

const LOG_ADDRESSES = logAddresses(ROBINHOOD_TESTNET);

const rpcError = (id: RpcCall["id"], message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code: -32600, message } });

export async function POST(request: Request): Promise<Response> {
  // Second line of the country check (custom-worker.ts is the first): Cloudflare sets this header.
  if (isBlockedCountry(request.headers.get("cf-ipcountry"))) {
    return Response.json(rpcError(null, "Nuluvium is not available in your country"), { status: 451 });
  }
  // Rules (origin, methods, logs, sizes) and why: lib/rpcPolicy.ts.
  const originProblem = originRefusal(request.headers.get("origin"), new URL(request.url).origin);
  if (originProblem) return Response.json(rpcError(null, originProblem), { status: 403 });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json(rpcError(null, "request too large"), { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json(rpcError(null, "invalid JSON"), { status: 400 });
  }
  const calls = (Array.isArray(body) ? body : [body]) as RpcCall[];
  if (calls.length === 0 || calls.length > MAX_BATCH) return Response.json(rpcError(null, "batch size out of range"), { status: 400 });
  for (const call of calls) {
    const reason = callRefusal(call, LOG_ADDRESSES);
    if (reason) return Response.json(rpcError(call.id, reason), { status: 403 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const upstream = (env as unknown as { PRIVATE_RPC_URL?: string }).PRIVATE_RPC_URL;
  if (!upstream) return Response.json(rpcError(null, "RPC not configured"), { status: 503 });

  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    // Pass the JSON-RPC answer through; never the upstream URL or headers.
    return new Response(await response.text(), {
      status: response.ok ? 200 : 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return Response.json(rpcError(null, "upstream RPC unreachable"), { status: 502 });
  }
}
