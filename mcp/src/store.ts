// Orders on the agent's own machine. No secrets in here, but the file links the fresh addresses of
// one order, so it must stay local (never sent to a server).

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type PieceStatus = "scheduled" | "sending" | "done" | "failed" | "cancelled";
export type OrderStatus = "scheduled" | "routing" | "done" | "cancelled" | "failed";

export interface StoredPiece {
  number: number;
  amount: string; // USDG units (6 decimals)
  at: number; // unix seconds
  status: PieceStatus;
  tx?: string;
  fresh?: string;
  received?: string; // token units
  fee?: string; // relayer gas fee, USDG units
  protocolFee?: string; // Router v2 protocol fee, USDG units
  sentAt?: number;
  error?: string;
}

export interface StoredOrder {
  id: string;
  network: string;
  token: string;
  amount: string;
  /** Deposit index of the note this order spends (notes themselves are rebuilt from chain). */
  depositIndex: string;
  slippageBps: number;
  createdAt: number;
  pieces: StoredPiece[];
}

export function orderStatus(order: StoredOrder): OrderStatus {
  const statuses = order.pieces.map((piece) => piece.status);
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "done")) return "done";
  if (statuses.every((status) => status === "done" || status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "done" || status === "sending")) return "routing";
  return "scheduled";
}

export class OrderStore {
  readonly file: string;
  private orders: StoredOrder[];

  constructor(home: string, network: string) {
    mkdirSync(home, { recursive: true });
    this.file = join(home, `orders-${network}.json`);
    this.orders = existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as StoredOrder[]) : [];
  }

  all(): StoredOrder[] {
    return this.orders;
  }

  get(id: string): StoredOrder | undefined {
    return this.orders.find((order) => order.id === id);
  }

  add(order: StoredOrder): void {
    this.orders.push(order);
    this.save();
  }

  /** Changes one piece and writes the file at once (atomic rename), so a crash loses nothing. */
  updatePiece(id: string, number: number, change: Partial<StoredPiece>): void {
    const piece = this.get(id)?.pieces.find((item) => item.number === number);
    if (!piece) throw new Error(`no piece ${number} in order ${id}`);
    Object.assign(piece, change);
    this.save();
  }

  save(): void {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.orders, null, 2));
    renameSync(temporary, this.file);
  }
}
