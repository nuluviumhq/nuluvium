// Talks to the Nuluvium relayer and signs what the fresh address must sign (order + permit).

import { parseSignature, type Address, type Hex, type PublicClient } from "viem";
import type { HDAccount } from "viem/accounts";
import { erc20Abi } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";
import type { FormattedProof } from "./proof.ts";

export interface Quote {
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

export async function getQuote(config: NetworkConfig): Promise<Quote> {
  const response = await fetch(`${config.relayerUrl}/quote`);
  if (!response.ok) throw new RelayerError(response.status, "quote failed");
  const body = (await response.json()) as { router: Address; relayer: Address; fee: string; gasCost: string };
  if (body.router.toLowerCase() !== config.router.toLowerCase()) throw new Error("relayer uses a different Router");
  return { router: body.router, relayer: body.relayer, fee: BigInt(body.fee), gasCost: BigInt(body.gasCost) };
}

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

export async function sendPiece(
  config: NetworkConfig,
  piece: {
    withdrawal: { processooor: Address; data: Hex };
    proof: FormattedProof;
    order: Order;
    orderSignature: Hex;
    permit: { deadline: string; v: string; r: Hex; s: Hex };
    fee: bigint;
  },
): Promise<{ tx: Hex; gasUsed: string }> {
  const body = {
    withdrawal: piece.withdrawal,
    proof: piece.proof,
    scope: config.scope.toString(),
    order: Object.fromEntries(Object.entries(piece.order).map(([key, value]) => [key, String(value)])),
    orderSignature: piece.orderSignature,
    permit: piece.permit,
    fee: piece.fee.toString(),
  };
  const response = await fetch(`${config.relayerUrl}/piece`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { tx?: Hex; gasUsed?: string; error?: string };
  if (!response.ok || !result.tx) throw new RelayerError(response.status, result.error ?? "relayer refused the piece");
  return { tx: result.tx, gasUsed: result.gasUsed ?? "" };
}

/** Sends a signed sell (stock token → USDG on the same fresh address) through Router.swap. */
export async function sendSell(
  config: NetworkConfig,
  sell: { order: Order; orderSignature: Hex; permit: { deadline: string; v: string; r: Hex; s: Hex }; fee: bigint },
): Promise<{ tx: Hex; gasUsed: string }> {
  const body = {
    order: Object.fromEntries(Object.entries(sell.order).map(([key, value]) => [key, String(value)])),
    orderSignature: sell.orderSignature,
    permit: sell.permit,
    fee: sell.fee.toString(),
  };
  const response = await fetch(`${config.relayerUrl}/sell`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { tx?: Hex; gasUsed?: string; error?: string };
  if (!response.ok || !result.tx) throw new RelayerError(response.status, result.error ?? "relayer refused the sell");
  return { tx: result.tx, gasUsed: result.gasUsed ?? "" };
}
