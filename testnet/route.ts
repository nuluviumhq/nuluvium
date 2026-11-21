// Session 1.6 demo: deposit 50 tUSDG, wait for the ASP, then route it as 5 pieces of random size at
// random times over 10 minutes. Each piece is a private withdrawal to its own fresh address plus a
// buy of the testnet mock stock, relayed in one transaction. Uses only @nuluvium/sdk.
// Usage (from testnet/): node route.ts [usdg] [pieces] [windowMinutes]   default 50 5 10

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ROBINHOOD_TESTNET as config,
  chainFor,

  depositUsdg,
  fetchApprovedSet,
  keysFromMnemonic,
  planPieces,
  publicClientFor,
  quotedBuy,
  runPlan,
  type RoutingEvent,
} from "../sdk/src/index.ts";
import { createFolderProver } from "../sdk/src/node.ts";
import { devVar } from "./recover.ts";

const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const USDG = 1_000_000n;
const show = (units: bigint) => `${Number(units) / 1e6} tUSDG`;
const time = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 19);

const amount = BigInt(process.argv[2] ?? 50) * USDG;
const pieces = Number(process.argv[3] ?? 5);
const windowSeconds = Number(process.argv[4] ?? 10) * 60;

const routerDeployment = JSON.parse(readFileSync(new URL("../contracts/deployments/46630-router.json", import.meta.url), "utf8")) as {
  mockStock: Address;
  mockUsdgPerStock: number;
};
const tokenAbi = parseAbi(["function mint(address to, uint256 amount)", "function balanceOf(address) view returns (uint256)"]);

const keys = keysFromMnemonic(devVar("TESTNET_NOTE_MNEMONIC"));
const client = publicClientFor(config);
const depositor = privateKeyToAccount(devVar("TESTNET_DEPLOYER_KEY") as `0x${string}`);
const wallet = createWalletClient({ account: depositor, chain: chainFor(config), transport: http(config.rpcUrl) });

console.log(`\n1. Mint and deposit ${show(amount)}`);
const mintTx = await wallet.writeContract({ address: config.usdg, abi: tokenAbi, functionName: "mint", args: [depositor.address, amount] });
await client.waitForTransactionReceipt({ hash: mintTx });
const { note, tx: depositTx } = await depositUsdg(client, wallet, config, keys, amount);
console.log(`  deposit ${note.depositIndex}: ${EXPLORER}/tx/${depositTx}`);

console.log("\n2. Wait for the ASP to approve it");
for (let tries = 0; ; tries++) {
  try {
    const set = await fetchApprovedSet(client, config);
    if (set.labels.includes(note.label)) {
      console.log(`  approved in set ${set.cid}`);
      break;
    }
    if (set.rejected.some((entry) => entry.label === String(note.label))) throw new Error("deposit rejected by the ASP");
  } catch (error) {
    if (error instanceof Error && /rejected/.test(error.message)) throw error;
  }
  if (tries > 30) throw new Error("ASP did not screen the deposit in time");
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

const start = Math.floor(Date.now() / 1000) + 30;
const plan = planPieces({ amount, pieces, windowSeconds, start, minPiece: 5n * USDG, minGapSeconds: 30 });
console.log(`\n3. Plan: ${pieces} pieces over ${windowSeconds / 60} minutes`);
for (const piece of plan) console.log(`  piece ${piece.number}: ${show(piece.amount)} at ${time(piece.at)} UTC`);

console.log("\n4. Route");
const price = BigInt(routerDeployment.mockUsdgPerStock);
const onEvent = (event: RoutingEvent) => {
  if (event.type === "waiting") console.log(`  waiting ${event.seconds} s for piece ${event.piece.number}`);
  if (event.type === "retry") console.log(`  piece ${event.piece.number} attempt ${event.attempt} failed (${event.reason}); retrying`);
  if (event.type === "sent") {
    const r = event.result;
    console.log(`  piece ${r.number} sent at ${time(r.sentAt)}: ${show(r.amount)} → ${r.fresh} ${EXPLORER}/tx/${r.tx}`);
  }
};
const { results, remaining } = await runPlan(
  { config, keys, client, prover: createFolderProver(new URL("./artifacts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")) },
  note,
  plan,
  // A fresh QuoterV2 quote per piece (testnet: the stand-in for the fixed-price mock), 1% slippage.
  quotedBuy(client, config, routerDeployment.mockStock, 100),
  { onEvent },
);

console.log("\n5. Check every fresh address");
const checks = [];
for (const result of results) {
  const [stock, usdg, eth] = await Promise.all([
    client.readContract({ address: routerDeployment.mockStock, abi: tokenAbi, functionName: "balanceOf", args: [result.fresh] }),
    client.readContract({ address: config.usdg, abi: tokenAbi, functionName: "balanceOf", args: [result.fresh] }),
    client.getBalance({ address: result.fresh }),
  ]);
  const expected = ((result.amount - result.fee) * 10n ** 18n) / price;
  const ok = stock === expected && usdg === 0n && eth === 0n;
  checks.push({ fresh: result.fresh, stock: stock.toString(), usdg: usdg.toString(), eth: eth.toString(), ok });
  console.log(`  ${result.fresh}: ${Number(stock) / 1e18} MSTK, ${usdg} tUSDG, ${eth} ETH ${ok ? "ok" : "MISMATCH"}`);
}
console.log(`\nDone. ${results.length} pieces routed; ${show(remaining.value)} stays shielded.`);

const run = {
  startedAt: new Date(start * 1000).toISOString(),
  deposit: { tx: depositTx, index: note.depositIndex.toString(), amount: amount.toString() },
  plan: plan.map((piece) => ({ number: piece.number, amount: piece.amount.toString(), at: time(piece.at) })),
  results: results.map((r) => ({ ...r, amount: r.amount.toString(), fee: r.fee.toString(), sentAt: time(r.sentAt) })),
  checks,
};
mkdirSync(new URL("./runs/", import.meta.url), { recursive: true });
const file = new URL(`./runs/route-${run.startedAt.replace(/[:.]/g, "-")}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(run, null, 2));
console.log(`  Run saved to ${file.pathname}`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
setTimeout(() => process.exit(process.exitCode ?? 0), 100); // snarkjs workers keep Node alive
