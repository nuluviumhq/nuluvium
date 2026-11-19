// Session 1.3 demo on Robinhood Chain testnet: the ASP Worker decides which deposits can be
// withdrawn privately.
//   A. 25 tUSDG from the deployer           -> approved -> private withdrawal to a fresh address
//   B. 1,001 tUSDG from the deployer        -> above the $1,000 cap -> no private withdrawal, ragequit
//   C. 10 tUSDG from the denylisted demo key -> rejected -> no private withdrawal, ragequit
// The ASP Worker posts the root on its own (cron); this script only waits for it.
//
// Usage (from testnet/): node asp-demo.mjs [--resume]   (--resume reuses the last three own deposits)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, addressLink, txLink } from "./lib.mjs";
import { ASP_URL, context, deposit, ownNotes, ragequit, show, toUnits, waitForScreening, withdrawToFresh } from "./notes.mjs";

async function expectNoPrivateWithdrawal(ctx, note, approved) {
  try {
    await withdrawToFresh(ctx, note, note.value, approved);
  } catch (error) {
    if (/Leaf not found/i.test(error.message)) return "not in the approved set, no withdrawal proof possible";
    throw error;
  }
  throw new Error(`Deposit ${note.label} was withdrawn privately but should have been rejected`);
}

async function main() {
  const ctx = context();
  const { TESTNET_DEPLOYER_KEY: deployerKey, TESTNET_DENYLISTED_KEY: deniedKey } = ctx.vars;
  if (!deniedKey) throw new Error("TESTNET_DENYLISTED_KEY missing in .dev.vars");
  const run = { startedAt: new Date().toISOString(), asp: ASP_URL, cases: {} };

  let clean, overCap, denied;
  if (process.argv.includes("--resume")) {
    // Continue an interrupted run: the last three own deposits are A, B and C.
    [clean, overCap, denied] = (await ownNotes(ctx)).slice(-3);
    console.log(`\nResuming with deposits ${clean.tx}, ${overCap.tx}, ${denied.tx}`);
  } else {
    console.log("\nA. Deposit 25 tUSDG (clean, under the caps)");
    clean = await deposit(ctx, deployerKey, toUnits(25));
    console.log("\nB. Deposit 1,001 tUSDG (above the $1,000 per-deposit cap)");
    overCap = await deposit(ctx, deployerKey, toUnits(1001));
    console.log("\nC. Deposit 10 tUSDG from the denylisted demo key");
    denied = await deposit(ctx, deniedKey, toUnits(10));
  }

  console.log("\nWaiting for the ASP Worker to screen the three deposits (cron runs every minute)...");
  const screening = await waitForScreening(ctx, [clean.label, overCap.label, denied.label]);
  console.log(`  root posted by the ASP: ${txLink(screening.tx)}`);
  console.log(`  published set: ${ASP_URL}/sets/${screening.cid} (CID and root checked)`);
  const reasonOf = (note) => screening.set.rejected.find((entry) => entry.label === String(note.label))?.reason ?? "approved";
  for (const [name, note] of [["A", clean], ["B", overCap], ["C", denied]]) console.log(`  ${name}: ${reasonOf(note)}`);

  console.log("\nA. Private withdrawal of 10 tUSDG");
  const withdrawal = await withdrawToFresh(ctx, clean, toUnits(10), screening.approved);
  console.log(`  fresh address got ${show(withdrawal.received)}, holds ${withdrawal.freshEth} wei ETH`);

  console.log("\nB. Try a private withdrawal, then ragequit");
  const overCapResult = await expectNoPrivateWithdrawal(ctx, overCap, screening.approved);
  console.log(`  private withdrawal: ${overCapResult}`);
  const overCapExit = await ragequit(ctx, overCap);
  console.log(`  returned ${show(overCapExit.returned)} to the depositor`);

  console.log("\nC. Try a private withdrawal, then ragequit");
  const deniedResult = await expectNoPrivateWithdrawal(ctx, denied, screening.approved);
  console.log(`  private withdrawal: ${deniedResult}`);
  const deniedExit = await ragequit(ctx, denied);
  console.log(`  returned ${show(deniedExit.returned)} to ${addressLink(denied.depositor)}`);

  run.screening = { cid: screening.cid, root: screening.root, tx: screening.tx, set: `${ASP_URL}/sets/${screening.cid}` };
  run.cases = {
    A: { deposit: clean.tx, label: clean.label, status: reasonOf(clean), withdrawal: withdrawal },
    B: { deposit: overCap.tx, label: overCap.label, status: reasonOf(overCap), privateWithdrawal: overCapResult, ragequit: overCapExit },
    C: { deposit: denied.tx, label: denied.label, status: reasonOf(denied), privateWithdrawal: deniedResult, ragequit: deniedExit },
  };

  const outDir = join(ROOT, "testnet", "runs");
  mkdirSync(outDir, { recursive: true });
  const prefix = process.env.RPC_URL ? "local-fork-" : "";
  const file = join(outDir, `${prefix}asp-demo-${run.startedAt.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(run, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2));
  console.log(`\nDone. Run saved to ${file}`);
}

main()
  // snarkjs leaves its worker threads alive after proving, which keeps Node running; exit explicitly.
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\nFailed: ${error.shortMessage ?? error.message}`);
    if (process.env.DEBUG) console.error(error);
    process.exit(1);
  });
