// Talks to the Nuluvium relayer and signs what the fresh address must sign (order + permit).

import { parseSignature, type Address, type Hex, type PublicClient } from "viem";
import type { HDAccount } from "viem/accounts";
import { erc20Abi } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";
import type { FormattedProof } from "./proof.ts";

export interface Quote {
  /** Relayer that gave the quote. */
  url: string;
  router: Address;
  relayer: Address;
  fee: bigint;
  gasCost: bigint;
}

export interface Order {
  owner: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  maxFee: bigint;
  nonce: bigint;
  deadline: bigint;
}

export class RelayerError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------ several relayers */

/** How long a relayer that failed is tried last (it is still tried if all others fail too). */
const SKIP_AFTER_FAILURE_MS = 2 * 60_000;
const QUOTE_TIMEOUT_MS = 8_000;
/** A piece waits for its receipt on the relayer (up to 60 s), so the request gets longer. */
const SEND_TIMEOUT_MS = 90_000;

/** Relayer URL → time it last failed. Per process (MCP server) or per tab (web app). */
const failedAt = new Map<string, number>();

export function markRelayerFailed(url: string, now = Date.now()): void {
  failedAt.set(url, now);
}

export function markRelayerOk(url: string): void {
  failedAt.delete(url);
}

/**
 * The order to try the relayers in: random (so no single relayer sees every piece of an order),
 * with relayers that failed in the last two minutes moved to the end.
 */
export function relayerOrder(urls: string[], { now = Date.now(), random = Math.random } = {}): string[] {
  const shuffled = [...urls];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const recentlyFailed = (url: string) => now - (failedAt.get(url) ?? Number.NEGATIVE_INFINITY) < SKIP_AFTER_FAILURE_MS;
  return [...shuffled.filter((url) => !recentlyFailed(url)), ...shuffled.filter(recentlyFailed)];
}

/** Fee quote from one relayer. Checks it sends to the same Router as `config`. */
export async function quoteFrom(config: NetworkConfig, url: string): Promise<Quote> {
  let response: Response;
  try {
    response = await fetch(`${url}/quote`, { signal: AbortSignal.timeout(QUOTE_TIMEOUT_MS) });
  } catch {
    throw new RelayerError(0, `relayer ${url} did not answer`);
  }
  if (!response.ok) throw new RelayerError(response.status, `relayer ${url} quote failed`);
  const body = (await response.json()) as { router: Address; relayer: Address; fee: string; gasCost: string };
  if (body.router.toLowerCase() !== config.router.toLowerCase()) throw new RelayerError(0, `relayer ${url} uses a different Router`);
  return { url, router: body.router, relayer: body.relayer, fee: BigInt(body.fee), gasCost: BigInt(body.gasCost) };
}

/** A quote from the first relayer that answers, in `relayerOrder`. */
export async function getQuote(config: NetworkConfig): Promise<Quote> {
  const reasons: string[] = [];
  for (const url of relayerOrder(config.relayerUrls)) {
    try {
      const quote = await quoteFrom(config, url);
      markRelayerOk(url);
      return quote;
    } catch (error) {
      markRelayerFailed(url);
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new RelayerError(0, `no relayer answered (${reasons.join("; ")})`);
}

interface Sent {
  tx: Hex;
  gasUsed: string;
  /** Fee the relayer that sent it took (its own quote; never above the order's maxFee). */
  fee: bigint;
  relayerUrl: string;
}

/**
 * Posts a signed piece or sell to `quote`'s relayer; if that one is down or refuses, to the others.
 * The same signatures and proof work with any relayer: the withdrawal's relay fee is 0, and the
 * Router pays its fee to whoever sends the transaction. Another relayer is asked for its own quote
 * first (same Router, fee within the signed maxFee).
 */
async function postWithFailover(config: NetworkConfig, path: "/piece" | "/sell", body: Record<string, unknown>, quote: Quote, maxFee: bigint): Promise<Sent> {
  const reasons: string[] = [];
  const others = relayerOrder(config.relayerUrls.filter((url) => url !== quote.url));
  for (const url of [quote.url, ...others]) {
    try {
      const fee = url === quote.url ? quote.fee : (await quoteFrom(config, url)).fee;
      if (fee > maxFee) throw new RelayerError(0, `relayer ${url} fee is above the signed maximum`);
      let response: Response;
      try {
        response = await fetch(`${url}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, fee: fee.toString() }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
      } catch {
        throw new RelayerError(0, `relayer ${url} did not answer`);
      }
      const result = (await response.json().catch(() => ({}))) as { tx?: Hex; gasUsed?: string; error?: string };
      if (!response.ok || !result.tx) throw new RelayerError(response.status, result.error ?? `relayer ${url} refused`);
      markRelayerOk(url);
      return { tx: result.tx, gasUsed: result.gasUsed ?? "", fee, relayerUrl: url };
    } catch (error) {
      markRelayerFailed(url);
      reasons.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new RelayerError(0, reasons.join("; "));
}

const stringFields = (order: Order) => Object.fromEntries(Object.entries(order).map(([key, value]) => [key, String(value)]));

export function signOrder(account: HDAccount, config: NetworkConfig, order: Order): Promise<Hex> {
  return account.signTypedData({
    domain: { name: "Nuluvium Router", version: "1", chainId: config.chainId, verifyingContract: config.router },
    types: {
      Order: [
        { name: "owner", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "minAmountOut", type: "uint256" },
        { name: "maxFee", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Order",
    message: order,
  });
}

/** EIP-2612 permit for `value` of `token` to `spender`, using the token's own EIP-712 domain. */
export async function signPermit(
  account: HDAccount,
  client: PublicClient,
  config: NetworkConfig,
  token: Address,
  spender: Address,
  value: bigint,
  deadline: bigint,
) {
  const [, name, version] = await client.readContract({ address: token, abi: erc20Abi, functionName: "eip712Domain" });
  const nonce = await client.readContract({ address: token, abi: erc20Abi, functionName: "nonces", args: [account.address] });
  const signature = parseSignature(
    await account.signTypedData({
      domain: { name, version, chainId: config.chainId, verifyingContract: token },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: account.address, spender, value, nonce, deadline },
    }),
  );
  const v = signature.v ?? BigInt((signature.yParity ?? 0) + 27);
  return { deadline: deadline.toString(), v: v.toString(), r: signature.r, s: signature.s };
}

/** Sends a signed piece (Router.relayAndSwap), failing over to another relayer if needed. */
export function sendPiece(
  config: NetworkConfig,
  quote: Quote,
  piece: {
    withdrawal: { processooor: Address; data: Hex };
    proof: FormattedProof;
    order: Order;
    orderSignature: Hex;
    permit: { deadline: string; v: string; r: Hex; s: Hex };
  },
): Promise<Sent> {
  const body = {
    withdrawal: piece.withdrawal,
    proof: piece.proof,
    scope: config.scope.toString(),
    order: stringFields(piece.order),
    orderSignature: piece.orderSignature,
    permit: piece.permit,
  };
  return postWithFailover(config, "/piece", body, quote, piece.order.maxFee);
}

/** Sends a signed sell (stock token → USDG on the same fresh address) through Router.swap. */
export function sendSell(
  config: NetworkConfig,
  quote: Quote,
  sell: { order: Order; orderSignature: Hex; permit: { deadline: string; v: string; r: Hex; s: Hex } },
): Promise<Sent> {
  const body = { order: stringFields(sell.order), orderSignature: sell.orderSignature, permit: sell.permit };
  return postWithFailover(config, "/sell", body, quote, sell.order.maxFee);
}
