// Source of funds, one hop back: where a depositor's USDG came from before the deposit.
//
// One alchemy_getAssetTransfers call per deposit (Alchemy's transfers API; plain eth_getLogs is
// capped at 10,000 blocks per call there, far too few to cover a wallet's history). It returns the
// most recent USDG transfers *to* the depositor up to the deposit block. That history never changes,
// so each trace is done once and kept in KV; the senders are checked against the current lists on
// every run (screen.js screenSources), so a sender listed later still counts.
//
// Fails closed: a trace that errors or times out is not saved, the deposit waits, and the Worker
// posts no new root until it is traced. Never puts the RPC URL in an error (it holds the key).

export const TRACES_KEY = "traces";
export const MAX_TRANSFERS = 100; // per deposit, newest first
export const MAX_TRACES_PER_RUN = 5; // request cap: the free Workers plan allows 50 subrequests a run
const TIMEOUT_MS = 10_000;

/**
 * Reads the USDG transfers a depositor received up to `toBlock`.
 * @returns {Promise<{transfers: Array<{from: string, value: string}>, truncated: boolean}>}
 */
export async function traceSources({ rpcUrl, usdg, depositor, toBlock, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [
          {
            toAddress: depositor,
            contractAddresses: [usdg],
            category: ["erc20"],
            fromBlock: "0x0",
            toBlock: `0x${BigInt(toBlock).toString(16)}`,
            order: "desc",
            maxCount: `0x${MAX_TRANSFERS.toString(16)}`,
            excludeZeroValue: true,
            withMetadata: false,
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`trace request failed: ${error.name}`);
  }
  if (!response.ok) throw new Error(`trace request failed: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`trace request failed: ${String(body.error.message).slice(0, 120)}`);
  const transfers = (body.result?.transfers ?? []).map((transfer) => {
    if (transfer.rawContract?.address?.toLowerCase() !== usdg.toLowerCase()) throw new Error("trace returned another token");
    return { from: transfer.from.toLowerCase(), value: BigInt(transfer.rawContract.value).toString() };
  });
  // pageKey means older transfers exist beyond the newest MAX_TRANSFERS; those are not checked.
  return { transfers, truncated: Boolean(body.result?.pageKey) };
}

/**
 * Adds `sources` to each deposit from the saved traces, tracing up to MAX_TRACES_PER_RUN missing
 * ones in chain order. Saves new traces to KV. Deposits still untraced get `sources: null`.
 * @returns {Promise<{deposits: object[], traced: number, failed: string[]}>}
 */
export async function attachSources(deposits, { kv, rpcUrl, usdg, fetchImpl = fetch }) {
  const saved = (await kv.get(TRACES_KEY, "json")) ?? {};
  const ordered = [...deposits].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  let traced = 0;
  const failed = [];
  for (const deposit of ordered) {
    const label = deposit.label.toString();
    if (saved[label] || traced + failed.length >= MAX_TRACES_PER_RUN) continue;
    try {
      saved[label] = await traceSources({ rpcUrl, usdg, depositor: deposit.depositor, toBlock: deposit.blockNumber, fetchImpl });
      traced += 1;
    } catch (error) {
      failed.push(`${label}: ${error.message}`);
      break; // later deposits wait behind this one anyway
    }
  }
  if (traced > 0) await kv.put(TRACES_KEY, JSON.stringify(saved));

  const withSources = deposits.map((deposit) => {
    const trace = saved[deposit.label.toString()];
    return {
      ...deposit,
      sources: trace ? { transfers: trace.transfers.map((item) => ({ from: item.from, value: BigInt(item.value) })), truncated: trace.truncated } : null,
    };
  });
  return { deposits: withSources, traced, failed };
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Every sender address in the traces (for the issuer isBlocked check); mints (from 0x0) left out. */
export function senderAddresses(deposits) {
  return deposits.flatMap((deposit) => (deposit.sources?.transfers ?? []).map((transfer) => transfer.from)).filter((from) => from !== ZERO);
}
