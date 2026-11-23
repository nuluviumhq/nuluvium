// Minimum outputs from a Uniswap v3 quote (QuoterV2.quoteExactInputSingle) at the fee tier the
// Router will swap on. The quote is an eth_call; nothing is sent. The relayer runs the same quote
// and refuses a piece whose minimum is far below it (relayer/src/bound.js).

import { parseAbi, type Address, type PublicClient } from "viem";
import type { NetworkConfig } from "./config.ts";
import type { BuyTarget } from "./routing.ts";

export const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

const routerPoolFeeAbi = parseAbi(["function poolFee(address token) view returns (uint24)"]);

/** Basis points in one whole. */
const BPS = 10_000n;

/** `amount` less `slippageBps` (rounded down). */
export function withSlippage(amount: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) throw new Error("slippage must be 0 to 9,999 basis points");
  return (amount * (BPS - BigInt(slippageBps))) / BPS;
}

/** Output of swapping `amountIn` of `tokenIn` for `tokenOut` on the Router's pool, quoted now. */
export async function quoteSwap(client: PublicClient, config: NetworkConfig, tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
  const stock = tokenIn.toLowerCase() === config.usdg.toLowerCase() ? tokenOut : tokenIn;
  const fee = await client.readContract({ address: config.router, abi: routerPoolFeeAbi, functionName: "poolFee", args: [stock] });
  if (fee === 0) throw new Error("token is not listed on the Router");
  const { result } = await client.simulateContract({
    address: config.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

/** Buy target whose minimum is a fresh quote for each piece, less `slippageBps`. */
export function quotedBuy(client: PublicClient, config: NetworkConfig, tokenOut: Address, slippageBps: number): BuyTarget {
  return {
    tokenOut,
    minAmountOut: async (usdgIn) => withSlippage(await quoteSwap(client, config, config.usdg, tokenOut, usdgIn), slippageBps),
  };
}

/**
 * Smallest USDG a sell of `amountIn` accepts after the fees: the quote less slippage, less twice the
 * quoted relayer fee (the order lets that fee rise up to it before the relayer sends) and less the
 * protocol fee on the quote (Router v2 takes it from the USDG the swap brings).
 * Returns 0 or less when the holding is worth less than the fees.
 */
export async function quotedSellMinimum(
  client: PublicClient,
  config: NetworkConfig,
  token: Address,
  amountIn: bigint,
  quotedFee: bigint,
  slippageBps: number,
): Promise<{ quoted: bigint; minimum: bigint }> {
  const quoted = await quoteSwap(client, config, token, config.usdg, amountIn);
  const protocolFee = (quoted * config.protocolFeeBps) / BPS;
  return { quoted, minimum: withSlippage(quoted, slippageBps) - quotedFee * 2n - protocolFee };
}
