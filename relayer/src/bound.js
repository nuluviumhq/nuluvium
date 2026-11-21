// Price-protection bound. The fresh address signs its own minimum output and nobody can loosen it,
// but a client with a bad price (or a bug) could sign a minimum so low that the piece can be
// sandwiched. The relayer quotes the same swap itself (QuoterV2 at the Router's fee tier) and
// refuses a minimum more than `maxSlippageBps` below that quote. Pure, so it runs under node --test.

import { BadRequest } from "./parse.js";

const BPS = 10_000n;

/**
 * @param {{ isBuy: boolean, minAmountOut: bigint, maxFee: bigint, quoted: bigint, maxSlippageBps: bigint }} input
 *   quoted: for a buy, tokens out for (amountIn − fee); for a sell, USDG out for amountIn.
 *   On a sell the order's minimum is net of the relayer fee, which may rise up to maxFee, so the
 *   bound is checked on minAmountOut + maxFee.
 * @returns {bigint} the smallest minimum this relayer accepts
 */
export function checkMinimum({ isBuy, minAmountOut, maxFee, quoted, maxSlippageBps }) {
  const floor = (quoted * (BPS - maxSlippageBps)) / BPS;
  const signed = isBuy ? minAmountOut : minAmountOut + maxFee;
  if (signed < floor) {
    throw new BadRequest(`order.minAmountOut is more than ${Number(maxSlippageBps) / 100}% below the current quote (price protection)`);
  }
  return isBuy ? floor : floor - maxFee;
}
