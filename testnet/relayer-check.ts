// Phase A check of quotes and two relayers, on Robinhood Chain testnet. Run both relayers first
// (from relayer/: `npx -y wrangler@4 dev --port 8801` and `npx -y wrangler@4 dev --env second --port 8802`),
// or point RELAYER_1 / RELAYER_2 at deployed ones.
//
//   1. quotes: both relayers answer /quote; the client order is random
//   2. price bound: a piece whose minimum is far below the quote is refused before it is simulated
//   3. failover: relayer 1 quotes, then refuses the piece (a small proxy stands in for it);
//      the same proof and signatures go to relayer 2, which sends it
//   4. sell back at a fresh quote through whichever relayer answers
//
// Usage (from testnet/): node relayer-check.ts [usdg per piece]   default 3

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { parseAbi, parseEventLogs } from "viem";
import {
  ROBINHOOD_TESTNET,
  executePiece,
  fetchApprovedSet,
  freshAccount,
  getQuote,
  keysFromMnemonic,
  markRelayerFailed,
  markRelayerOk,
  publicClientFor,
  quoteFrom,
  quoteSwap,
  quotedBuy,
  recoverNotes,
  sellAtQuote,
} from "../sdk/src/index.ts";
import { createFolderProver } from "../sdk/src/node.ts";
import { devVar } from "./recover.ts";

const EXPLORER = "https://explorer.testnet.chain.robinhood.com";
const MSTK = "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088" as const;
const R1 = process.env.RELAYER_1 ?? "http://127.0.0.1:8801";
const R2 = process.env.RELAYER_2 ?? "http://127.0.0.1:8802";
const pieceAmount = BigInt(Math.round(Number(process.argv[2] ?? 3) * 1e6));
const show = (units: bigint) => `${Number(units) / 1e6} tUSDG`;

const base = { ...ROBINHOOD_TESTNET, rpcUrl: devVar("TESTNET_RPC_URL"), logChunk: 10_000n };
const client = publicClientFor(base);
const keys = keysFromMnemonic(devVar("TESTNET_NOTE_MNEMONIC"));
const routerAbi = parseAbi([
  "event Swapped(address indexed owner, uint256 indexed nonce, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, address feeRecipient)",
]);

console.log("1. Quotes");
const [q1, q2] = await Promise.all([quoteFrom(base, R1), quoteFrom(base, R2)]);
console.log(`  relayer 1 ${q1.relayer} fee ${show(q1.fee)}; relayer 2 ${q2.relayer} fee ${show(q2.fee)}`);
const both = { ...base, relayerUrls: [R1, R2] };
const picks = [];
for (let i = 0; i < 6; i++) picks.push((await getQuote(both)).url === R1 ? 1 : 2);
console.log(`  six getQuote picks: ${picks.join(" ")}`);

console.log("\n2. Price bound (fake proof: the bound runs before the simulation)");
const quotedOut = await quoteSwap(client, base, base.usdg, MSTK, 10_000_000n - q2.fee);
const fakeBody = (minAmountOut: bigint) => ({
  withdrawal: { processooor: base.entrypoint, data: "0x00" },
  proof: { pA: ["1", "1"], pB: [["1", "1"], ["1", "1"]], pC: ["1", "1"], pubSignals: Array(8).fill("1") },
  scope: base.scope.toString(),
  order: {
    owner: "0x0000000000000000000000000000000000000002",
    tokenIn: base.usdg,
    tokenOut: MSTK,
    amountIn: "10000000",
    minAmountOut: minAmountOut.toString(),
    maxFee: (q2.fee * 2n).toString(),
    nonce: "1",
    deadline: String(Math.floor(Date.now() / 1000) + 600),
  },
  orderSignature: "0x00",
  permit: { deadline: "1", v: "27", r: `0x${"11".repeat(32)}`, s: `0x${"22".repeat(32)}` },
  fee: q2.fee.toString(),
});
const post = async (url: string, body: unknown) => {
  const response = await fetch(`${url}/piece`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, error: ((await response.json()) as { error?: string }).error };
};
const low = await post(R2, fakeBody((quotedOut * 90n) / 100n));
console.log(`  minimum 10% below the quote: ${low.status} ${low.error}`);
const fair = await post(R2, fakeBody((quotedOut * 99n) / 100n));
console.log(`  minimum 1% below the quote:  ${fair.status} ${fair.error} (passes the bound, then the fake proof fails the simulation)`);
if (low.status !== 400 || !/below the current quote/.test(low.error ?? "")) throw new Error("bound did not refuse");
if (fair.status === 400 && /below the current quote/.test(fair.error ?? "")) throw new Error("bound refused a fair minimum");

console.log("\n3. Failover: relayer 1 quotes, then refuses; relayer 2 sends the same piece");
// Stand-in for relayer 1 going down after its quote: forwards /quote, answers 503 to /piece.
const proxy = createServer(async (request, response) => {
  if (request.url === "/quote") {
    const upstream = await fetch(`${R1}/quote`);
    response.writeHead(upstream.status, { "content-type": "application/json" }).end(await upstream.text());
    return;
  }
  response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "relayer 1 is down (test)" }));
});
await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const P = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
const failover = { ...base, relayerUrls: [P, R2] };
markRelayerFailed(R2); // so the stand-in for relayer 1 is asked for the quote first

const [{ spendable }, approved] = await Promise.all([recoverNotes(client, base, keys), fetchApprovedSet(client, base)]);
const note = spendable.find((item) => approved.labels.includes(item.label) && item.value >= pieceAmount);
if (!note) throw new Error(`no approved note holds ${show(pieceAmount)}: deposit first (testnet/route.ts)`);
console.log(`  note ${note.depositIndex}: ${show(note.value)}, piece ${show(pieceAmount)}`);
const prover = createFolderProver(new URL("./artifacts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const fresh = freshAccount(keys, note.depositIndex, note.withdrawals);
const { result } = await executePiece({ config: failover, keys, client, prover }, note, 0, pieceAmount, quotedBuy(client, failover, MSTK, 100));
proxy.close();
markRelayerOk(R2);
const receipt = await client.waitForTransactionReceipt({ hash: result.tx });
const [swapped] = parseEventLogs({ abi: routerAbi, logs: receipt.logs, eventName: "Swapped" });
console.log(`  sent by ${result.relayerUrl === R2 ? "relayer 2" : result.relayerUrl}: ${EXPLORER}/tx/${result.tx}`);
console.log(`  tx from ${receipt.from}; Router fee ${show(swapped!.args.fee)} to ${swapped!.args.feeRecipient}; ${Number(swapped!.args.amountOut) / 1e18} MSTK to ${fresh.address}`);
if (receipt.from.toLowerCase() !== q2.relayer.toLowerCase()) throw new Error("piece was not sent by relayer 2");

console.log("\n4. Sell back at a fresh quote");
const held = await client.readContract({ address: MSTK, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [fresh.address] });
const sold = await sellAtQuote(client, both, fresh, MSTK, held, 100);
console.log(`  ${Number(held) / 1e18} MSTK quoted at ${show(sold.quoted)}, fee ${show(sold.fee)}: ${EXPLORER}/tx/${sold.tx}`);
await client.waitForTransactionReceipt({ hash: sold.tx });
console.log("\nAll checks passed.");
process.exit(0); // viem keeps sockets open
