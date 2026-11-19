// Session 1.7 check: drives the Nuluvium MCP server over stdio, exactly as an agent's MCP client
// would, on Robinhood Chain testnet.
//   1. list tools; get_balance
//   2. route_order: 6 USDG of MSTK in 3 pieces over 3 minutes
//   3. route_order a second order and cancel it at once
//   4. poll get_orders until the first order is done; then get_fills
// Usage (from testnet/): node mcp-client.ts

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { devVar } from "./recover.ts";

const home = mkdtempSync(join(tmpdir(), "nuluvium-mcp-"));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../mcp/src/server.ts", import.meta.url))],
  env: {
    ...process.env,
    NULUVIUM_MNEMONIC: devVar("TESTNET_NOTE_MNEMONIC"),
    NULUVIUM_RPC_URL: devVar("TESTNET_RPC_URL"),
    NULUVIUM_HOME: home,
  } as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "nuluvium-check", version: "0.1.0" });
await client.connect(transport);

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  const text = result.content[0]?.text ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text);
}

const { tools } = await client.listTools();
console.log("Tools:", tools.map((tool) => tool.name).join(", "));

const balance = await call("get_balance");
console.log("\nget_balance:", JSON.stringify(balance, null, 2));

const order = await call("route_order", { token: "MSTK", usdgAmount: 6, pieces: 3, windowMinutes: 3 });
console.log("\nroute_order:", JSON.stringify(order, null, 2));

const second = await call("route_order", { token: "MSTK", usdgAmount: 4, pieces: 2, windowMinutes: 5 });
const cancelled = await call("cancel_order", { orderId: second.orderId });
console.log(`\ncancel_order ${second.orderId}: status ${cancelled.status}, ${cancelled.cancelledPieces} pieces cancelled`);

const unknownToken = (await client.callTool({ name: "route_order", arguments: { token: "TSLA", usdgAmount: 5 } })) as {
  content: Array<{ text: string }>;
  isError?: boolean;
};
console.log(`route_order TSLA → error: ${unknownToken.isError} (${unknownToken.content[0]?.text})`);

for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const { orders } = await call("get_orders");
  const first = orders.find((item: { orderId: string }) => item.orderId === order.orderId);
  console.log(`  ${new Date().toISOString().slice(11, 19)} ${first.status}: ${first.pieces.map((piece: { status: string }) => piece.status).join(", ")}`);
  if (first.status === "done" || first.status === "failed") break;
}

const fills = await call("get_fills", { orderId: order.orderId });
console.log("\nget_fills:", JSON.stringify(fills, null, 2));
const after = await call("get_balance");
console.log("\nget_balance after:", after.total);
await client.close();
process.exit(0);
