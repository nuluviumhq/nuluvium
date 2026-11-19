// Rebuilds every note of the testnet mnemonic from the chain alone and prints them.
// Usage (from testnet/): node recover.ts

import { readFileSync } from "node:fs";
import { ROBINHOOD_TESTNET, keysFromMnemonic, publicClientFor, recoverNotes } from "../sdk/src/index.ts";

/** Reads one value from ../.dev.vars without printing anything secret. */
export function devVar(name: string): string {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\r\\n]*)"?`, "m"));
  if (!match?.[1]) throw new Error(`${name} missing in .dev.vars`);
  return match[1];
}

export function devVarOptional(name: string): string | undefined {
  try {
    return devVar(name);
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const keys = keysFromMnemonic(devVar("TESTNET_NOTE_MNEMONIC"));
  // Own RPC when the public one is unreachable (ISP block); Alchemy allows 10,000 blocks per log query.
  const rpcUrl = process.env.USE_PUBLIC_RPC ? undefined : devVarOptional("TESTNET_RPC_URL");
  const config = rpcUrl ? { ...ROBINHOOD_TESTNET, rpcUrl, logChunk: 10_000n } : ROBINHOOD_TESTNET;
  const client = publicClientFor(config);
  const started = Date.now();
  const { spendable, spent } = await recoverNotes(client, config, keys);
  console.log(`(scanned in ${((Date.now() - started) / 1000).toFixed(1)} s)`);
  const show = (units: bigint) => `${Number(units) / 1e6} tUSDG`;
  console.log("Spendable:");
  for (const note of spendable) console.log(`  deposit ${note.depositIndex}: ${show(note.value)} after ${note.withdrawals} withdrawal(s)`);
  console.log("Spent (fully withdrawn or ragequit):");
  for (const note of spent) console.log(`  deposit ${note.depositIndex}: ${note.withdrawals} withdrawal(s)`);
  const total = spendable.reduce((sum, note) => sum + note.value, 0n);
  console.log(`Total shielded: ${show(total)}`);
}
