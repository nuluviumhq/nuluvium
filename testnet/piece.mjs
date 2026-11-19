// Session 1.5: one piece of a private order through the relayer service, on Robinhood Chain testnet.
//   1. deposit tUSDG and wait for the ASP to approve it
//   2. ask the relayer for its fee
//   3. prove a withdrawal of the piece amount to a fresh address (relay fee 0: the Router fee pays
//      the relayer), and have the fresh address sign a USDG permit and a buy order
//   4. POST the piece; the relayer sends Router.relayAndSwap: withdrawal + buy in one transaction
//
// The swap leg uses the testnet mock stock and fixed-price mock router (no official Uniswap on
// testnet); real prices are covered by the mainnet fork tests (docs/router.md).
//
// Usage (from testnet/): node piece.mjs [depositUsdg] [pieceUsdg] [--resume]   default 20 and 12

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAbi, parseSignature } from "viem";
import { ROOT, addressLink, txLink } from "./lib.mjs";
import { context, deposit, formatProof, freshAccount, ownNotes, proveWithdrawal, show, toUnits, waitForScreening } from "./notes.mjs";

const RELAYER_URL = process.env.RELAYER_URL ?? "https://relayer.nuluvium.com";
const SLIPPAGE_BPS = 100n;

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

async function main() {
  const depositAmount = toUnits(process.argv[2] ?? 20);
  const pieceAmount = toUnits(process.argv[3] ?? 12);
  const ctx = context();
  const { publicClient, deployment } = ctx;
  const routerDeployment = JSON.parse(readFileSync(join(ROOT, "contracts", "deployments", "46630-router.json"), "utf8"));
  const stock = routerDeployment.mockStock;

  let note;
  if (process.argv.includes("--resume")) {
    note = (await ownNotes(ctx)).at(-1); // continue with the latest own deposit
    console.log(`\n1. Resume with deposit ${txLink(note.tx)} (${show(note.value)}); wait for the ASP`);
  } else {
    console.log(`\n1. Deposit ${show(depositAmount)} and wait for the ASP`);
    note = await deposit(ctx, ctx.vars.TESTNET_DEPLOYER_KEY, depositAmount);
  }
  const screening = await waitForScreening(ctx, [note.label]);
  if (!screening.approved.includes(note.label)) throw new Error("Deposit was not approved by the ASP");
  console.log(`  approved (root ${txLink(screening.tx)})`);

  console.log("\n2. Relayer quote");
  const quote = await (await fetch(`${RELAYER_URL}/quote`)).json();
  if (quote.router.toLowerCase() !== routerDeployment.router.toLowerCase()) throw new Error("Relayer uses another Router");
  const fee = BigInt(quote.fee);
  console.log(`  fee ${show(fee)} (gas part ${show(BigInt(quote.gasCost))}), relayer ${quote.relayer}`);

  console.log(`\n3. Prove a ${show(pieceAmount)} withdrawal and sign the buy`);
  const fresh = freshAccount(ctx, note);
  console.log(`  fresh address: ${fresh.address}`);
  const { withdrawal, proof, proofSeconds } = await proveWithdrawal(ctx, note, pieceAmount, screening.approved, {
    recipient: fresh.address,
    feeRecipient: quote.relayer,
    relayFeeBps: 0n,
  });

  const expectedOut = ((pieceAmount - fee) * 10n ** 18n) / BigInt(routerDeployment.mockUsdgPerStock);
  const order = {
    owner: fresh.address,
    tokenIn: deployment.usdg,
    tokenOut: stock,
    amountIn: pieceAmount,
    minAmountOut: (expectedOut * (10_000n - SLIPPAGE_BPS)) / 10_000n,
    maxFee: fee * 2n, // room for the quote to move before the piece is sent
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 15 * 60),
  };
  const orderSignature = await fresh.signTypedData({
    domain: { name: "Nuluvium Router", version: "1", chainId: deployment.chainId, verifyingContract: routerDeployment.router },
    types: {
      Order: [
        { name: "owner", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "minAmountOut", type: "uint256" },
        { name: "maxFee", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Order",
    message: order,
  });

  const [, name, version] = await publicClient.readContract({ address: deployment.usdg, abi: erc20Abi, functionName: "eip712Domain" });
  const permitNonce = await publicClient.readContract({ address: deployment.usdg, abi: erc20Abi, functionName: "nonces", args: [fresh.address] });
  const permitDeadline = order.deadline;
  const permitSignature = parseSignature(
    await fresh.signTypedData({
      domain: { name, version, chainId: deployment.chainId, verifyingContract: deployment.usdg },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: { owner: fresh.address, spender: routerDeployment.router, value: pieceAmount, nonce: permitNonce, deadline: permitDeadline },
    }),
  );

  console.log("\n4. Send the piece to the relayer");
  const body = {
    withdrawal,
    proof: formatProof(proof),
    scope: deployment.scope.toString(),
    order: Object.fromEntries(Object.entries(order).map(([key, value]) => [key, String(value)])),
    orderSignature,
    permit: {
      deadline: permitDeadline.toString(),
      v: String(permitSignature.v ?? BigInt(permitSignature.yParity + 27)),
      r: permitSignature.r,
      s: permitSignature.s,
    },
    fee: fee.toString(),
  };
  const response = await fetch(`${RELAYER_URL}/piece`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Relayer refused the piece (${response.status}): ${result.error}`);
  console.log(`  relayAndSwap: ${txLink(result.tx)} (gas used ${result.gasUsed})`);

  // Read at the block of the relayed transaction: a load-balanced RPC can lag a block behind.
  const { blockNumber } = await publicClient.waitForTransactionReceipt({ hash: result.tx });
  const balance = (token, owner) =>
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], blockNumber });
  const stockBalance = await balance(stock, fresh.address);
  const usdgBalance = await balance(deployment.usdg, fresh.address);
  const freshEth = await publicClient.getBalance({ address: fresh.address, blockNumber });
  if (stockBalance !== expectedOut) throw new Error(`Fresh address holds ${stockBalance} stock units, expected ${expectedOut}`);
  if (usdgBalance !== 0n || freshEth !== 0n) throw new Error("Fresh address should hold only the stock token");

  console.log(`\nDone. Fresh address holds ${Number(stockBalance) / 1e18} MSTK (mock stock), 0 tUSDG, 0 ETH.`);
  console.log(`  ${show(note.value - pieceAmount)} stays shielded. Fresh address: ${addressLink(fresh.address)}`);

  const run = {
    startedAt: new Date().toISOString(),
    relayer: RELAYER_URL,
    deposit: note.tx,
    screening: { cid: screening.cid, tx: screening.tx },
    piece: { tx: result.tx, gasUsed: result.gasUsed, fee: fee.toString(), proofSeconds, fresh: fresh.address, stockReceived: stockBalance.toString() },
  };
  const outDir = join(ROOT, "testnet", "runs");
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `piece-${run.startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(run, null, 2));
  console.log(`  Run saved to ${file}`);
}

main()
  // snarkjs leaves its worker threads alive after proving, which keeps Node running; exit explicitly.
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\nFailed: ${error.shortMessage ?? error.message}`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
