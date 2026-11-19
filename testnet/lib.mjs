// Shared helpers for the session 1.2 testnet scripts.
// Reads secrets from ../.dev.vars (never printed), the deployment from
// ../contracts/deployments/46630.json, and circuit files from ./artifacts.

import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Circuits } from "@0xbow/privacy-pools-core-sdk";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, "..");
export const ARTIFACT_DIR = join(here, "artifacts");
export const EXPLORER = "https://explorer.testnet.chain.robinhood.com";

// RPC_URL lets the same scripts run against a local anvil fork of testnet before the real thing.
export const RPC_URL = process.env.RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";

export const robinhoodTestnet = defineChain({
  id: 46_630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Blockscout", url: EXPLORER } },
});

/** Parses KEY=value lines from ../.dev.vars. Values are never logged. */
export function loadDevVars() {
  const path = join(ROOT, ".dev.vars");
  if (!existsSync(path)) throw new Error(".dev.vars not found (see docs/testnet.md)");
  const vars = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) vars[match[1]] = match[2];
  }
  for (const name of ["TESTNET_DEPLOYER_KEY", "TESTNET_NOTE_MNEMONIC"]) {
    if (!vars[name]) throw new Error(`${name} missing in .dev.vars`);
  }
  return vars;
}

export function loadDeployment() {
  const path = join(ROOT, "contracts", "deployments", "46630.json");
  if (!existsSync(path)) throw new Error("No testnet deployment yet: run the forge deploy script first");
  const deployment = JSON.parse(readFileSync(path, "utf8"));
  // L2 block of the first deploy transaction, from forge's broadcast receipts (block.number inside
  // the script would be the L1 block on Arbitrum chains).
  const broadcast = join(ROOT, "contracts", "broadcast", "DeployTestnet.s.sol", "46630", "run-latest.json");
  const blocks = JSON.parse(readFileSync(broadcast, "utf8")).receipts.map((receipt) => BigInt(receipt.blockNumber));
  const deploymentBlock = blocks.reduce((min, block) => (block < min ? block : min));
  return { ...deployment, scope: BigInt(deployment.scope), deploymentBlock };
}

export function clients(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(undefined, { timeout: 30_000, retryCount: 2 });
  return {
    account,
    publicClient: createPublicClient({ chain: robinhoodTestnet, transport }),
    walletClient: createWalletClient({ chain: robinhoodTestnet, transport, account }),
  };
}

/**
 * Circuits loader that reads the artifacts copied by setup-artifacts.mjs.
 * The SDK's own Node loader turns file URLs into "/D:/..." paths, which fail on Windows.
 * Integrity is still checked by the SDK (SHA-256 of every file against its pinned hashes).
 */
export class LocalCircuits extends Circuits {
  constructor() {
    super({ browser: false });
  }

  async _fetchVersionedArtifact(artifactPath) {
    return new Uint8Array(await readFile(join(ARTIFACT_DIR, basename(artifactPath))));
  }
}

/** Depth of a lean incremental Merkle tree holding `size` leaves. */
export function leanTreeDepth(size) {
  return size <= 1 ? 0n : BigInt(Math.ceil(Math.log2(size)));
}

export const txLink = (hash) => `${EXPLORER}/tx/${hash}`;
export const addressLink = (address) => `${EXPLORER}/address/${address}`;
