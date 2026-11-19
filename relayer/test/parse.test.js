import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequest, parsePiece, parseSell } from "../src/parse.js";

const USDG = "0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa";
const STOCK = "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088";
const OWNER = "0x07751C531F27830cE5BAdA54B57436B83845c2c9";

const sell = (overrides = {}) => ({
  order: { owner: OWNER, tokenIn: STOCK, tokenOut: USDG, amountIn: "1000", minAmountOut: "1", maxFee: "200000", nonce: "7", deadline: "1900000000" },
  orderSignature: "0x1234",
  permit: { deadline: "1900000000", v: "27", r: `0x${"11".repeat(32)}`, s: `0x${"22".repeat(32)}` },
  fee: "100000",
  ...overrides,
});

test("parseSell: typed arguments for Router.swap", () => {
  const parsed = parseSell(sell(), USDG);
  assert.equal(parsed.order.amountIn, 1000n);
  assert.equal(parsed.order.tokenOut, USDG);
  assert.equal(parsed.permit.v, 27);
  assert.equal(parsed.fee, 100_000n);
});

test("parseSell: only sells for USDG", () => {
  const buy = sell();
  buy.order = { ...buy.order, tokenIn: USDG, tokenOut: STOCK };
  assert.throws(() => parseSell(buy, USDG), /only sells/);
});

test("parseSell: malformed bodies are BadRequest", () => {
  assert.throws(() => parseSell({}, USDG), BadRequest);
  assert.throws(() => parseSell(sell({ fee: "-1" }), USDG), /fee must be a decimal string/);
  assert.throws(() => parseSell(sell({ orderSignature: "nope" }), USDG), /orderSignature must be hex/);
});

test("parsePiece: still needs the withdrawal and proof", () => {
  assert.throws(() => parsePiece(sell()), /withdrawal, proof, order and permit are required/);
});

test("orders without price protection (minAmountOut 0) or with nothing to swap are refused", () => {
  const order = sell().order;
  assert.throws(() => parseSell(sell({ order: { ...order, minAmountOut: "0" } }), USDG), /minAmountOut must be above 0/);
  assert.throws(() => parseSell(sell({ order: { ...order, amountIn: "0" } }), USDG), /amountIn must be above 0/);
});
