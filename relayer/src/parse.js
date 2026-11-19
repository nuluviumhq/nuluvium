// Request parsing for the relayer: turns JSON bodies into typed Router arguments and rejects
// anything malformed. No Workers imports, so it runs under node --test.

import { getAddress, isHex } from "viem";

export class BadRequest extends Error {}

const uint = (value, name) => {
  if (typeof value !== "string" || !/^\d{1,78}$/.test(value)) throw new BadRequest(`${name} must be a decimal string`);
  return BigInt(value);
};
const address = (value, name) => {
  try {
    return getAddress(value);
  } catch {
    throw new BadRequest(`${name} must be an address`);
  }
};
const hex = (value, name) => {
  if (!isHex(value)) throw new BadRequest(`${name} must be hex`);
  return value;
};
const uints = (values, length, name) => {
  if (!Array.isArray(values) || values.length !== length) throw new BadRequest(`${name} must have ${length} items`);
  return values.map((value, index) => uint(value, `${name}[${index}]`));
};

/** Largest request body the relayer reads (a piece with its proof is about 3 KB). */
export const MAX_BODY_BYTES = 32 * 1024;

const parseOrder = (order) => {
  const parsed = {
    owner: address(order?.owner, "order.owner"),
    tokenIn: address(order.tokenIn, "order.tokenIn"),
    tokenOut: address(order.tokenOut, "order.tokenOut"),
    amountIn: uint(order.amountIn, "order.amountIn"),
    minAmountOut: uint(order.minAmountOut, "order.minAmountOut"),
    maxFee: uint(order.maxFee, "order.maxFee"),
    nonce: uint(order.nonce, "order.nonce"),
    deadline: uint(order.deadline, "order.deadline"),
  };
  // The fresh address signs its own price limit and nobody can loosen it, but a limit of 0 means
  // no price protection at all: anyone watching the mempool could sandwich the piece. Refused.
  if (parsed.minAmountOut === 0n) throw new BadRequest("order.minAmountOut must be above 0 (price protection)");
  if (parsed.amountIn === 0n) throw new BadRequest("order.amountIn must be above 0");
  return parsed;
};
const parsePermit = (permit) => ({
  deadline: uint(permit.deadline, "permit.deadline"),
  v: Number(uint(permit.v, "permit.v")),
  r: hex(permit.r, "permit.r"),
  s: hex(permit.s, "permit.s"),
});

/** Turns the JSON body into typed contract arguments; rejects anything malformed. */
export function parsePiece(body) {
  const { withdrawal, proof, order, permit } = body ?? {};
  if (!withdrawal || !proof || !order || !permit) throw new BadRequest("withdrawal, proof, order and permit are required");
  return {
    withdrawal: { processooor: address(withdrawal.processooor, "withdrawal.processooor"), data: hex(withdrawal.data, "withdrawal.data") },
    proof: {
      pA: uints(proof.pA, 2, "proof.pA"),
      pB: [uints(proof.pB?.[0], 2, "proof.pB[0]"), uints(proof.pB?.[1], 2, "proof.pB[1]")],
      pC: uints(proof.pC, 2, "proof.pC"),
      pubSignals: uints(proof.pubSignals, 8, "proof.pubSignals"),
    },
    scope: uint(body.scope, "scope"),
    order: parseOrder(order),
    orderSignature: hex(body.orderSignature, "orderSignature"),
    permit: parsePermit(permit),
    fee: uint(body.fee, "fee"),
  };
}

/**
 * A sell from a fresh address. Only sells are relayed this way (tokenOut must be `usdg`): a buy
 * always comes out of the shielded pool through /piece. The Router checks everything else.
 */
export function parseSell(body, usdg) {
  const { order, permit } = body ?? {};
  if (!order || !permit) throw new BadRequest("order and permit are required");
  const parsed = { order: parseOrder(order), orderSignature: hex(body.orderSignature, "orderSignature"), permit: parsePermit(permit), fee: uint(body.fee, "fee") };
  if (parsed.order.tokenOut.toLowerCase() !== usdg.toLowerCase()) throw new BadRequest("only sells for USDG are relayed here");
  return parsed;
}
