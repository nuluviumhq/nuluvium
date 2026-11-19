// Sends the pieces of orders from this browser while the tab is open (same rules as the agent MCP
// server, mcp/src/engine.ts): each piece at its time, pieces of one note one after another, the note
// rebuilt from the chain before every piece, up to 3 attempts per piece. After a reload and unlock,
// pieces still scheduled resume; one whose time has passed goes out at once.

import type { Note, RoutingContext, UserKeys } from "@nuluvium/sdk";
import { parseAbi } from "viem";
import { browserConfig, sdk } from "./chain";
import { loadOrders, saveOrders, type Order, type Piece } from "./orders";
import { TOKENS, expectedOut } from "./tokens";

const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 20_000;

export class OrderEngine {
  orders: Order[] = [];
  private ctx: RoutingContext | null = null;
  private readonly timers = new Map<string, number>();
  private readonly lanes = new Map<string, Promise<void>>();
  private saving: Promise<void> = Promise.resolve();
  private stopped = false;
  readonly address: string;
  readonly keys: UserKeys;
  private readonly onChange: (orders: Order[]) => void;
  /** Called after a piece lands, so balances can refresh. */
  private readonly onPieceDone: () => void;

  constructor(address: string, keys: UserKeys, onChange: (orders: Order[]) => void, onPieceDone: () => void) {
    this.address = address;
    this.keys = keys;
    this.onChange = onChange;
    this.onPieceDone = onPieceDone;
  }

  async start(): Promise<void> {
    this.orders = await loadOrders(this.address, this.keys);
    this.emit();
    for (const order of this.orders) {
      for (const piece of order.pieces) {
        // A piece caught mid-send by a reload is tried again: the note rebuild shows if it landed.
        if (piece.status === "scheduled" || piece.status === "sending") this.arm(order.id, piece.number);
      }
    }
  }

  /** Stops timers (on lock or page leave). Pieces stay scheduled and resume after the next unlock. */
  stop(): void {
    this.stopped = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async notes(): Promise<Note[]> {
    const { recoverNotes } = await sdk();
    const ctx = await this.context();
    return (await recoverNotes(ctx.client, ctx.config, this.keys)).spendable;
  }

  async add(order: Order): Promise<void> {
    this.orders = [order, ...this.orders];
    await this.persist();
    for (const piece of order.pieces) this.arm(order.id, piece.number);
  }

  /** Cancels pieces not sent yet. Returns how many. */
  async cancel(orderId: string): Promise<number> {
    let cancelled = 0;
    for (const piece of this.orders.find((order) => order.id === orderId)?.pieces ?? []) {
      if (piece.status !== "scheduled") continue;
      clearTimeout(this.timers.get(`${orderId}:${piece.number}`));
      this.timers.delete(`${orderId}:${piece.number}`);
      piece.status = "cancelled";
      cancelled += 1;
    }
    await this.persist();
    return cancelled;
  }

  private async context(): Promise<RoutingContext> {
    if (this.ctx) return this.ctx;
    const { createUrlProver, publicClientFor } = await sdk();
    const config = await browserConfig();
    this.ctx = { config, keys: this.keys, client: publicClientFor(config), prover: createUrlProver(`${window.location.origin}/`) };
    return this.ctx;
  }

  private emit() {
    this.onChange(this.orders.map((order) => ({ ...order, pieces: order.pieces.map((piece) => ({ ...piece })) })));
  }

  private persist(): Promise<void> {
    this.emit();
    // Saves run one after another so an older snapshot never overwrites a newer one.
    this.saving = this.saving.then(() => saveOrders(this.address, this.keys, this.orders));
    return this.saving;
  }

  private update(orderId: string, number: number, change: Partial<Piece>) {
    const piece = this.orders.find((order) => order.id === orderId)?.pieces.find((item) => item.number === number);
    if (piece) Object.assign(piece, change);
    return this.persist();
  }

  private arm(orderId: string, number: number) {
    const order = this.orders.find((item) => item.id === orderId);
    const piece = order?.pieces.find((item) => item.number === number);
    if (!order || !piece) return;
    const key = `${orderId}:${number}`;
    if (this.timers.has(key)) return;
    const delay = Math.max(0, piece.at * 1000 - Date.now());
    this.timers.set(
      key,
      window.setTimeout(() => {
        this.timers.delete(key);
        const lane = this.lanes.get(order.depositIndex) ?? Promise.resolve();
        const next = lane.then(() => this.runPiece(orderId, number));
        this.lanes.set(order.depositIndex, next.catch(() => {}));
      }, delay),
    );
  }

  private async runPiece(orderId: string, number: number): Promise<void> {
    const order = this.orders.find((item) => item.id === orderId);
    const piece = order?.pieces.find((item) => item.number === number);
    if (this.stopped || !order || !piece || piece.status === "cancelled" || piece.status === "done") return;
    const token = TOKENS.find((item) => item.symbol === order.token);
    if (!token) return void (await this.update(orderId, number, { status: "failed", error: `unknown token ${order.token}` }));

    for (let attempt = 1; ; attempt++) {
      await this.update(orderId, number, { status: "sending" });
      try {
        const { executePiece } = await sdk();
        const ctx = await this.context();
        const note = (await this.notes()).find((item) => item.depositIndex === BigInt(order.depositIndex));
        if (!note) throw new Error("The note for this order is no longer in your balance.");
        const amount = BigInt(piece.amount);
        if (amount > note.value) throw new Error("Your note holds less than this piece.");

        const { result } = await executePiece(ctx, note, number, amount, {
          tokenOut: token.address,
          minAmountOut: (usdgIn) => (expectedOut(token, usdgIn) * BigInt(10_000 - order.slippageBps)) / 10_000n,
        });
        const receipt = await ctx.client.waitForTransactionReceipt({ hash: result.tx });
        const received = await ctx.client.readContract({
          address: token.address,
          abi: balanceAbi,
          functionName: "balanceOf",
          args: [result.fresh],
          blockNumber: receipt.blockNumber,
        });
        await this.update(orderId, number, {
          status: "done",
          tx: result.tx,
          fresh: result.fresh,
          fee: result.fee.toString(),
          received: received.toString(),
          sentAt: Math.floor(Date.now() / 1000),
          error: undefined,
        });
        this.onPieceDone();
        return;
      } catch (error) {
        const reason = (error as { shortMessage?: string }).shortMessage ?? (error instanceof Error ? error.message : String(error));
        if (this.stopped) return;
        if (attempt >= MAX_ATTEMPTS) return void (await this.update(orderId, number, { status: "failed", error: reason }));
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}
