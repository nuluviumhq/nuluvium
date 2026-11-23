// Runs orders in the background: each piece at its time, pieces of one order one after another.
// Before every piece the note is rebuilt from the chain, so restarts and partial runs are safe.

import { parseAbi, type PublicClient } from "viem";
import {
  executePiece,
  fetchApprovedSet,
  publicClientFor,
  quotedBuy,
  recoverNotes,
  type Note,
  type RoutingContext,
  type UserKeys,
} from "../../sdk/src/index.ts";
import { createFolderProver } from "../../sdk/src/node.ts";
import type { ApprovalSet } from "./approval.ts";
import type { Network } from "./networks.ts";
import type { OrderStore, StoredOrder } from "./store.ts";

const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 20_000;

export class Engine {
  readonly ctx: RoutingContext;
  readonly network: Network;
  readonly store: OrderStore;
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** One promise chain per note (deposit index): pieces spending the same note never overlap. */
  private readonly lanes = new Map<string, Promise<void>>();

  /** Resolves once the circuit files are on disk; called before every proof (retries a failed download). */
  private readonly prepareProver: () => Promise<void>;

  constructor(network: Network, keys: UserKeys, store: OrderStore, artifactFolder: string, prepareProver: () => Promise<void>) {
    this.network = network;
    this.store = store;
    this.prepareProver = prepareProver;
    const client: PublicClient = publicClientFor(network.config);
    this.ctx = { config: network.config, keys, client, prover: createFolderProver(artifactFolder) };
  }

  async notes(): Promise<Note[]> {
    return (await recoverNotes(this.ctx.client, this.ctx.config, this.ctx.keys)).spendable;
  }

  /** The last approved set that matched the root on chain. */
  private lastApprovedSet: ApprovalSet | null = null;

  /**
   * The ASP's approved set, checked against its CID and the root on chain. After the ASP posts a
   * new root, its status can point at the previous set for up to about a minute (Cloudflare KV
   * spreads writes slowly), so a fresh read may not match. Then the last matching set is used: it
   * can only miss the newest approvals, which then show as waiting. Null when no set has matched
   * yet in this run.
   */
  async approvedSet(): Promise<ApprovalSet | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.lastApprovedSet = await fetchApprovedSet(this.ctx.client, this.ctx.config);
        return this.lastApprovedSet;
      } catch {
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
    return this.lastApprovedSet;
  }

  /** Arms timers for every piece still scheduled (new orders and orders left from a restart). */
  resumeAll(): void {
    for (const order of this.store.all()) {
      for (const piece of order.pieces) {
        // A piece caught mid-send by a restart is checked again: the note rebuild shows if it landed.
        if (piece.status === "scheduled" || piece.status === "sending") this.arm(order, piece.number);
      }
    }
  }

  arm(order: StoredOrder, number: number): void {
    const piece = order.pieces.find((item) => item.number === number)!;
    const key = `${order.id}:${number}`;
    if (this.timers.has(key)) return;
    const delay = Math.max(0, piece.at * 1000 - Date.now());
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const lane = this.lanes.get(order.depositIndex) ?? Promise.resolve();
        const next = lane.then(() => this.runPiece(order.id, number));
        this.lanes.set(order.depositIndex, next.catch(() => {}));
      }, delay),
    );
  }

  /** Stops pieces not sent yet. Returns how many were cancelled. */
  cancel(order: StoredOrder): number {
    let cancelled = 0;
    for (const piece of order.pieces) {
      if (piece.status !== "scheduled") continue;
      const key = `${order.id}:${piece.number}`;
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
      this.store.updatePiece(order.id, piece.number, { status: "cancelled" });
      cancelled += 1;
    }
    return cancelled;
  }

  private async runPiece(orderId: string, number: number): Promise<void> {
    const order = this.store.get(orderId);
    const piece = order?.pieces.find((item) => item.number === number);
    if (!order || !piece || piece.status === "cancelled" || piece.status === "done") return;
    const token = this.network.tokens[order.token]!;

    for (let attempt = 1; ; attempt++) {
      this.store.updatePiece(orderId, number, { status: "sending" });
      try {
        await this.prepareProver();
        const note = (await this.notes()).find((item) => item.depositIndex === BigInt(order.depositIndex));
        if (!note) throw new Error("the note for this order is gone (spent elsewhere?)");
        const amount = BigInt(piece.amount);
        if (amount > note.value) throw new Error(`note holds ${note.value}, piece needs ${amount}`);

        const target = quotedBuy(this.ctx.client, this.ctx.config, token.address, order.slippageBps);
        const { result } = await executePiece(this.ctx, note, number, amount, target);
        const receipt = await this.ctx.client.waitForTransactionReceipt({ hash: result.tx });
        const received = await this.ctx.client.readContract({
          address: token.address,
          abi: balanceAbi,
          functionName: "balanceOf",
          args: [result.fresh],
          blockNumber: receipt.blockNumber,
        });
        this.store.updatePiece(orderId, number, {
          status: "done",
          tx: result.tx,
          fresh: result.fresh,
          fee: result.fee.toString(),
          protocolFee: result.protocolFee.toString(),
          received: received.toString(),
          sentAt: Math.floor(Date.now() / 1000),
          error: undefined,
        });
        return;
      } catch (error) {
        const reason = (error as { shortMessage?: string }).shortMessage ?? (error instanceof Error ? error.message : String(error));
        if (attempt >= MAX_ATTEMPTS) {
          this.store.updatePiece(orderId, number, { status: "failed", error: reason });
          return;
        }
        console.error(`[nuluvium] piece ${orderId}:${number} attempt ${attempt} failed: ${reason}; retrying`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}
