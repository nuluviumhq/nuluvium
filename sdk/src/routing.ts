// Sends pieces: each one is a private withdrawal of the piece amount to its own fresh address and
// a buy, relayed in one transaction (Router.relayAndSwap). Pieces from one note run in order,
// because each spends the change note the previous one created.

import type { PrivacyPoolSDK } from "@0xbow/privacy-pools-core-sdk";
import type { Address, Hex, PublicClient } from "viem";
import { fetchApprovedSet } from "./asp.ts";
import { poolEvents } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";
import { freshAccount, type UserKeys } from "./keys.ts";
import { noteAfterWithdrawal, type Note } from "./notes.ts";
import type { PlannedPiece } from "./planner.ts";
import { formatProof, proveWithdrawal } from "./proof.ts";
import { getQuote, sendPiece, signOrder, signPermit, type Order } from "./relayer.ts";

export interface RoutingContext {
  config: NetworkConfig;
  keys: UserKeys;
  client: PublicClient;
  prover: PrivacyPoolSDK;
}

export interface BuyTarget {
  tokenOut: Address;
  /** Smallest amount of tokenOut the owner accepts for `usdgIn` (after the relayer fee). */
  minAmountOut: (usdgIn: bigint) => Promise<bigint> | bigint;
}

export interface PieceResult {
  number: number;
  amount: bigint;
  tx: Hex;
  fresh: Address;
  fee: bigint;
  proofSeconds: number;
  gasUsed: string;
  /** Relayer that sent it. */
  relayerUrl: string;
  attempts: number;
  sentAt: number;
}

export type RoutingEvent =
  | { type: "waiting"; piece: PlannedPiece; seconds: number }
  | { type: "sending"; piece: PlannedPiece; attempt: number }
  | { type: "sent"; result: PieceResult }
  | { type: "retry"; piece: PlannedPiece; attempt: number; reason: string };

const ORDER_DEADLINE_SECONDS = 15 * 60;

/** Random 64-bit order nonce (the Router only checks it was not used before by this owner). */
export function randomNonce(): bigint {
  const words = new Uint32Array(2);
  crypto.getRandomValues(words);
  return (BigInt(words[0]!) << 32n) | BigInt(words[1]!);
}

/** One piece, end to end. Returns the result and the note left afterwards. */
export async function executePiece(
  ctx: RoutingContext,
  note: Note,
  pieceNumber: number,
  amount: bigint,
  target: BuyTarget,
): Promise<{ result: Omit<PieceResult, "number" | "attempts" | "sentAt">; next: Note }> {
  const { config, keys, client, prover } = ctx;
  const quote = await getQuote(config);
  if (amount <= quote.fee) throw new Error("piece smaller than the relayer fee");
  const fresh = freshAccount(keys, note.depositIndex, note.withdrawals);

  const [approved, leafLogs] = await Promise.all([fetchApprovedSet(client, config), poolEvents(client, config, "LeafInserted")]);
  const leaves = leafLogs.sort((a, b) => Number((a.args._index as bigint) - (b.args._index as bigint))).map((log) => log.args._leaf as bigint);

  // Relay fee 0 in the withdrawal: the relayer is paid once, through the Router, in USDG.
  const { withdrawal, proof, seconds } = await proveWithdrawal(
    prover,
    config,
    keys,
    note,
    amount,
    { recipient: fresh.address, feeRecipient: quote.relayer, relayFeeBps: 0n },
    leaves,
    approved.labels,
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + ORDER_DEADLINE_SECONDS);
  const order: Order = {
    owner: fresh.address,
    tokenIn: config.usdg,
    tokenOut: target.tokenOut,
    amountIn: amount,
    minAmountOut: await target.minAmountOut(amount - quote.fee),
    maxFee: quote.fee * 2n, // room for the quote to move before the relayer sends
    nonce: randomNonce(),
    deadline,
  };
  const [orderSignature, permit] = await Promise.all([
    signOrder(fresh, config, order),
    signPermit(fresh, client, config, config.usdg, config.router, amount, deadline),
  ]);

  const sent = await sendPiece(config, quote, { withdrawal, proof: formatProof(proof), order, orderSignature, permit });
  return {
    result: { amount, tx: sent.tx, fresh: fresh.address, fee: sent.fee, proofSeconds: seconds, gasUsed: sent.gasUsed, relayerUrl: sent.relayerUrl },
    next: noteAfterWithdrawal(keys, note, amount),
  };
}

/**
 * Sends every piece of `plan` from `note` at its time. A failed piece is rebuilt and retried (the
 * ASP root or the state tree may have moved since the proof was made). Returns the results and the
 * note that stays shielded.
 */
export async function runPlan(
  ctx: RoutingContext,
  startNote: Note,
  plan: PlannedPiece[],
  target: BuyTarget,
  {
    onEvent = () => {},
    maxAttempts = 3,
    retryDelayMs = 20_000,
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  }: {
    onEvent?: (event: RoutingEvent) => void;
    maxAttempts?: number;
    retryDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<{ results: PieceResult[]; remaining: Note }> {
  const total = plan.reduce((sum, piece) => sum + piece.amount, 0n);
  if (total > startNote.value) throw new Error("plan is larger than the note");

  let note = startNote;
  const results: PieceResult[] = [];
  for (const piece of plan) {
    const wait = piece.at * 1000 - Date.now();
    if (wait > 0) {
      onEvent({ type: "waiting", piece, seconds: Math.round(wait / 1000) });
      await sleep(wait);
    }
    for (let attempt = 1; ; attempt++) {
      onEvent({ type: "sending", piece, attempt });
      try {
        const { result, next } = await executePiece(ctx, note, piece.number, piece.amount, target);
        const full: PieceResult = { ...result, number: piece.number, attempts: attempt, sentAt: Math.floor(Date.now() / 1000) };
        results.push(full);
        onEvent({ type: "sent", result: full });
        note = next;
        break;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (attempt >= maxAttempts) throw new Error(`piece ${piece.number} failed after ${attempt} attempts: ${reason}`);
        onEvent({ type: "retry", piece, attempt, reason });
        await sleep(retryDelayMs);
      }
    }
  }
  return { results, remaining: note };
}
