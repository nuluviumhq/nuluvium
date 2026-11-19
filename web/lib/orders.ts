// Orders and their pieces, kept in this browser only. The schedule holds no secret keys, but it
// links the fresh addresses of an order, so it is encrypted (AES-GCM) with a key derived from the
// person's Nuluvium keys: it can only be read after unlocking. It leaves the device only as a backup
// file the person downloads on Account, still encrypted the same way.

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

/** Decrypts a stored "iv.data" string; throws when the keys do not fit or the data is damaged. */
async function decryptOrders(stored: string, keys: UserKeys): Promise<Order[]> {
  const [iv, data] = stored.split(".");
  if (!iv || !data) throw new Error("Not an order record.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await storageKey(keys), fromBase64(data));
  const orders = JSON.parse(new TextDecoder().decode(plain)) as unknown;
  if (!Array.isArray(orders)) throw new Error("Not an order list.");
  return orders as Order[];
}

async function encryptOrders(orders: Order[], keys: UserKeys): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await storageKey(keys), encoder.encode(JSON.stringify(orders))));
  return `${toBase64(iv)}.${toBase64(data)}`;
}

function readStored(address: string): string | null {
  try {
    return localStorage.getItem(STORAGE_PREFIX + address.toLowerCase());
  } catch {
    return null;
  }
}

export async function loadOrders(address: string, keys: UserKeys): Promise<Order[]> {
  const stored = readStored(address);
  if (!stored) return [];
  try {
    return await decryptOrders(stored, keys);
  } catch {
    // Wrong keys or damaged data: start empty rather than fail (pieces already sent stay on chain).
    return [];
  }
}

export async function saveOrders(address: string, keys: UserKeys, orders: Order[]): Promise<void> {
  const stored = await encryptOrders(orders, keys);
  try {
    localStorage.setItem(STORAGE_PREFIX + address.toLowerCase(), stored);
  } catch {
    // Storage blocked (private window): the schedule lives for this visit only.
  }
}

/* ------------------------------------------------------------------ backup (Account page) */

const BACKUP_KIND = "nuluvium-orders-backup";

/**
 * The backup file: the same encrypted record as in this browser, plus a label. It holds no address
 * and nothing readable; only the keys that made it can open it.
 */
export async function makeBackup(address: string, keys: UserKeys): Promise<{ json: string; count: number }> {
  const orders = await loadOrders(address, keys);
  const record = { kind: BACKUP_KIND, version: 1, createdAt: new Date().toISOString(), orders: await encryptOrders(orders, keys) };
  return { json: JSON.stringify(record, null, 2), count: orders.length };
}

/**
 * Restores a backup into this browser: orders it holds that are not here yet are added; orders
 * already here are kept as they are (they are the newer copy). Throws a message for the person when
 * the file is not a backup or was made with other keys.
 */
export async function restoreBackup(address: string, keys: UserKeys, fileText: string): Promise<{ added: number; total: number }> {
  let record: { kind?: unknown; orders?: unknown };
  try {
    record = JSON.parse(fileText) as typeof record;
  } catch {
    throw new Error("This file is not a Nuluvium backup.");
  }
  if (record.kind !== BACKUP_KIND || typeof record.orders !== "string") throw new Error("This file is not a Nuluvium backup.");
  let incoming: Order[];
  try {
    incoming = await decryptOrders(record.orders, keys);
  } catch {
    throw new Error("This backup was made with other keys. Log in with the wallet or recovery phrase that made it.");
  }
  const current = await loadOrders(address, keys);
  const known = new Set(current.map((order) => order.id));
  const added = incoming.filter((order) => !known.has(order.id));
  const merged = [...current, ...added].sort((a, b) => b.createdAt - a.createdAt);
  await saveOrders(address, keys, merged);
  return { added: added.length, total: merged.length };
}
