import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { OrderStore, orderStatus, type PieceStatus, type StoredOrder } from "../src/store.ts";

const order = (...statuses: PieceStatus[]): StoredOrder => ({
  id: "ord_test",
  network: "robinhood-testnet",
  token: "MSTK",
  amount: "3000000",
  depositIndex: "0",
  slippageBps: 100,
  createdAt: 0,
  pieces: statuses.map((status, number) => ({ number, amount: "1000000", at: number, status })),
});

test("order status follows its pieces", () => {
  assert.equal(orderStatus(order("scheduled", "scheduled")), "scheduled");
  assert.equal(orderStatus(order("done", "scheduled")), "routing");
  assert.equal(orderStatus(order("sending", "scheduled")), "routing");
  assert.equal(orderStatus(order("done", "done")), "done");
  assert.equal(orderStatus(order("done", "cancelled")), "cancelled");
  assert.equal(orderStatus(order("cancelled", "cancelled")), "cancelled");
  assert.equal(orderStatus(order("done", "failed")), "failed");
});

test("store writes every change to disk and reads it back", () => {
  const home = mkdtempSync(join(tmpdir(), "nuluvium-"));
  const store = new OrderStore(home, "robinhood-testnet");
  store.add(order("scheduled", "scheduled"));
  store.updatePiece("ord_test", 1, { status: "done", tx: "0xabc" });

  const reloaded = new OrderStore(home, "robinhood-testnet");
  assert.equal(reloaded.get("ord_test")?.pieces[1]?.tx, "0xabc");
  assert.equal(JSON.parse(readFileSync(store.file, "utf8")).length, 1);
  assert.throws(() => store.updatePiece("ord_test", 9, {}), /no piece 9/);
});
