// Orders and their pieces, kept in this browser only. The schedule holds no secret keys, but it
// links the fresh addresses of an order, so it is encrypted (AES-GCM) with a key derived from the
// person's Nuluvium keys: it can only be read after unlocking, and never leaves the device.

import type { UserKeys } from "@nuluvium/sdk";

export type PieceStatus = "scheduled" | "sending" | "done" | "failed" | "cancelled";
export type OrderStatus = "scheduled" | "routing" | "done" | "cancelled" | "failed";

export interface Piece {
  number: number;
  amount: string; // tUSDG units (6 decimals)
  at: number; // unix seconds
  status: PieceStatus;
  tx?: string;
  fresh?: string;
  received?: string; // token units
  fee?: string;
  sentAt?: number;
  error?: string;
}

export interface Order {
  id: string;
  token: string;
  side: "buy";
  amount: string; // tUSDG units
  window: string; // as chosen, e.g. "30 min"
  /** Deposit index of the note that pays for this order (the note itself is rebuilt from chain). */
  depositIndex: string;
  slippageBps: number;
  createdAt: number;
  pieces: Piece[];
}

export function orderStatus(order: Order): OrderStatus {
  const statuses = order.pieces.map((piece) => piece.status);
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.every((status) => status === "done")) return "done";
  if (statuses.every((status) => status === "done" || status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "done" || status === "sending")) return "routing";
  return "scheduled";
}

export const isOpen = (order: Order) => ["scheduled", "routing"].includes(orderStatus(order));
export const piecesDone = (order: Order) => order.pieces.filter((piece) => piece.status === "done").length;

const STORAGE_PREFIX = "nuluvium-orders-v1:";
const encoder = new TextEncoder();

async function storageKey(keys: UserKeys): Promise<CryptoKey> {
  // SHA-256 over a label and the master nullifier: only someone with the keys can derive it.
  const material = encoder.encode(`nuluvium-orders-v1:${keys.masterKeys.masterNullifier.toString(16)}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

export async function loadOrders(address: string, keys: UserKeys): Promise<Order[]> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_PREFIX + address.toLowerCase());
  } catch {
    return [];
  }
  if (!stored) return [];
  const [iv, data] = stored.split(".");
  if (!iv || !data) return [];
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await storageKey(keys), fromBase64(data));
    return JSON.parse(new TextDecoder().decode(plain)) as Order[];
  } catch {
    // Wrong keys or damaged data: start empty rather than fail (pieces already sent stay on chain).
    return [];
  }
}

export async function saveOrders(address: string, keys: UserKeys, orders: Order[]): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await storageKey(keys), encoder.encode(JSON.stringify(orders))));
  try {
    localStorage.setItem(STORAGE_PREFIX + address.toLowerCase(), `${toBase64(iv)}.${toBase64(data)}`);
  } catch {
    // Storage blocked (private window): the schedule lives for this visit only.
  }
}
