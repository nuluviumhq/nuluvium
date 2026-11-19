// One deposit and one private withdrawal on Robinhood Chain testnet, against the unchanged Privacy
// Pools v1 contracts (contracts/script/DeployTestnet.s.sol):
//   1. deposit tUSDG into the shielded pool
//   2. wait for the ASP Worker to approve it and post the root (asp/, session 1.3)
//   3. prove and relay a private partial withdrawal to a fresh address
//
// Usage (from testnet/):  node flow.mjs [depositUsdg] [withdrawUsdg]   default 25 and 10

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, addressLink, txLink } from "./lib.mjs";
import { RELAY_FEE_BPS, context, deposit, show, toUnits, waitForScreening, withdrawToFresh } from "./notes.mjs";

async function main() {
  const depositAmount = toUnits(process.argv[2] ?? 25);
  const withdrawAmount = toUnits(process.argv[3] ?? 10);
  if (withdrawAmount <= 0n || withdrawAmount > depositAmount) throw new Error("withdraw must be > 0 and <= deposit");

  const ctx = context();
  const run = { startedAt: new Date().toISOString(), steps: {} };

  console.log(`\n1. Deposit ${show(depositAmount)}`);
  const note = await deposit(ctx, ctx.vars.TESTNET_DEPLOYER_KEY, depositAmount);
  run.steps.deposit = { tx: note.tx, label: note.label, value: note.value };

  console.log("\n2. Wait for the ASP to screen it");
  const screening = await waitForScreening(ctx, [note.label]);
  if (!screening.approved.includes(note.label)) {
    const reason = screening.set.rejected.find((entry) => entry.label === String(note.label))?.reason;
    throw new Error(`Deposit not approved (${reason}); it can only be ragequit`);
  }
  console.log(`  approved; root ${txLink(screening.tx)}`);
  run.steps.screening = { cid: screening.cid, tx: screening.tx };

  console.log(`\n3. Withdraw ${show(withdrawAmount)} privately`);
  const withdrawal = await withdrawToFresh(ctx, note, withdrawAmount, screening.approved);
  run.steps.withdraw = withdrawal;

  console.log(`\nDone. Fresh address got ${show(withdrawal.received)} (after a ${RELAY_FEE_BPS} bps relay fee) and holds ${withdrawal.freshEth} wei ETH.`);
  console.log(`  ${show(note.value - withdrawAmount)} stays shielded as a new note.`);
  console.log(`  Fresh address: ${addressLink(withdrawal.fresh)}`);

  const outDir = join(ROOT, "testnet", "runs");
  mkdirSync(outDir, { recursive: true });
  const prefix = process.env.RPC_URL ? "local-fork-" : ""; // local anvil runs are not evidence
  const file = join(outDir, `${prefix}${run.startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(run, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
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
