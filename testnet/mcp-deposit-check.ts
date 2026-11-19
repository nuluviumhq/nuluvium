// MCP deposit tool check on Robinhood Chain testnet, driven over stdio like an agent's client.
//   1. Funds the test agent's deposit wallet (its mnemonic's account 0) from the deployer:
//      test USDG by mint, and a little ETH for gas when it has none.
//   2. deposit refusals: under 1 USDG, over the 1,000 USDG cap.
//   3. deposit 16 USDG (larger than any older note); get_balance before and after shows it.
//   4. route_order 16 USDG at once is refused (the only note that covers it waits for the ASP);
//      get_balance is then polled until the ASP approves the note. No order is sent.
// Usage (from testnet/): node mcp-deposit-check.ts

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWalletClient, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { ROBINHOOD_TESTNET, chainFor, depositAccount, keysFromMnemonic, publicClientFor } from "../sdk/src/index.ts";
import { devVar } from "./recover.ts";

const rpcUrl = devVar("TESTNET_RPC_URL");
const config = { ...ROBINHOOD_TESTNET, rpcUrl, logChunk: 10_000n };
const mnemonic = devVar("TESTNET_NOTE_MNEMONIC");
const agentWallet = depositAccount(keysFromMnemonic(mnemonic)).address;
const client = publicClientFor(config);

// 1. Fund the agent's deposit wallet (testnet tokens only).
const payer = createWalletClient({ account: privateKeyToAccount(devVar("TESTNET_DEPLOYER_KEY") as `0x${string}`), chain: chainFor(config), transport: http(rpcUrl) });
const mint = await payer.writeContract({ address: config.usdg, abi: parseAbi(["function mint(address to, uint256 amount)"]), functionName: "mint", args: [agentWallet, 20_000_000n] });
await client.waitForTransactionReceipt({ hash: mint });
if ((await client.getBalance({ address: agentWallet })) < parseEther("0.0001")) {
  const gas = await payer.sendTransaction({ to: agentWallet, value: parseEther("0.0002") });
  await client.waitForTransactionReceipt({ hash: gas });
}
console.log(`Funded deposit wallet ${agentWallet} with 20 test USDG`);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../mcp/src/server.ts", import.meta.url))],
  env: { ...process.env, NULUVIUM_MNEMONIC: mnemonic, NULUVIUM_RPC_URL: rpcUrl, NULUVIUM_HOME: mkdtempSync(join(tmpdir(), "nuluvium-mcp-")) } as Record<string, string>,
  stderr: "inherit",
});
const mcp = new Client({ name: "nuluvium-deposit-check", version: "0.1.0" });
await mcp.connect(transport);

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await mcp.callTool({ name, arguments: args })) as { content: Array<{ text: string }>; isError?: boolean };
  return { error: Boolean(result.isError), text: result.content[0]?.text ?? "" };
}

const { tools } = await mcp.listTools();
console.log("Tools:", tools.map((tool) => tool.name).join(", "));

const before = JSON.parse((await call("get_balance")).text);
console.log("\nBefore:", JSON.stringify({ total: before.total, notes: before.notes.length, depositWallet: before.depositWallet }));

for (const usdgAmount of [0.5, 1001]) {
  const result = await call("deposit", { usdgAmount });
  console.log(`deposit ${usdgAmount} → error ${result.error}: ${result.text}`);
}

const deposit = await call("deposit", { usdgAmount: 16 });
console.log("\ndeposit 16 →", deposit.error ? `ERROR ${deposit.text}` : deposit.text);

const after = JSON.parse((await call("get_balance")).text);
console.log("\nAfter:", JSON.stringify({ total: after.total, approvedTotal: after.approvedTotal, notes: after.notes, depositWallet: after.depositWallet }));

// The new note is the only one that covers 16 USDG, and the ASP has not approved it yet.
const early = await call("route_order", { token: "MSTK", usdgAmount: 16, pieces: 2, windowMinutes: 2 });
console.log(`\nroute_order 16 right after the deposit → error ${early.error}: ${early.text}`);

const newNote = deposit.error ? undefined : JSON.parse(deposit.text).note;
for (let tries = 0; newNote !== undefined && tries < 12; tries++) {
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const balance = JSON.parse((await call("get_balance")).text);
  const status = balance.notes.find((item: { note: number }) => item.note === newNote)?.status;
  console.log(`after ${(tries + 1) * 20} s: note ${newNote} ${status}`);
  if (status !== "waiting") break;
}

await mcp.close();
process.exit(deposit.error ? 1 : 0);
