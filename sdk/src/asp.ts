// The approved set a withdrawal must prove membership of, read from the ASP and checked twice:
// the document against its CID (SHA-256), and its root against the root posted on chain.

import { generateMerkleProof } from "@0xbow/privacy-pools-core-sdk";
import type { PublicClient } from "viem";
import { entrypointAbi } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";

export interface ApprovedSet {
  cid: string;
  root: bigint;
  labels: bigint[];
  /** Refused deposits; `code` is the stable reason code (sets published before 2026-11-24 have only the text). */
  rejected: Array<{ label: string; reason: string; code?: string }>;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** SHA-256 digest inside a raw CIDv1 ("b" + base32 of 0x01 0x55 0x12 0x20 digest). */
export function cidDigestHex(cid: string): string {
  if (!/^b[a-z2-7]{58}$/.test(cid)) throw new Error(`not a raw CIDv1: ${cid}`);
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of cid.slice(1)) {
    buffer = ((buffer << 5) | BASE32.indexOf(char)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  if (bytes[0] !== 0x01 || bytes[1] !== 0x55 || bytes[2] !== 0x12 || bytes[3] !== 0x20) throw new Error("unexpected CID prefix");
  return bytes.slice(4).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Root of a lean Merkle tree of labels (a single leaf is its own root). */
export function rootOf(labels: bigint[]): bigint {
  if (labels.length === 0) return 0n;
  if (labels.length === 1) return labels[0]!;
  return generateMerkleProof(labels, labels[0]!).root;
}

interface SetDocument {
  root: bigint;
  labels: bigint[];
  /** Refused deposits; `code` is the stable reason code (sets published before 2026-11-24 have only the text). */
  rejected: Array<{ label: string; reason: string; code?: string }>;
}

/** The set document stored under `cid`, checked against the CID and against its own root. */
async function fetchSetDocument(config: NetworkConfig, cid: string): Promise<SetDocument> {
  const bytes = new Uint8Array(await (await fetch(`${config.aspUrl}/sets/${cid}`)).arrayBuffer());
  if ((await sha256Hex(bytes)) !== cidDigestHex(cid)) throw new Error(`ASP set does not match its CID ${cid}`);
  const document = JSON.parse(new TextDecoder().decode(bytes)) as { root: string; approvedLabels: string[]; rejected: SetDocument["rejected"] };
  const labels = document.approvedLabels.map(BigInt);
  if (rootOf(labels) !== BigInt(document.root)) throw new Error(`ASP set ${cid} does not hash to its root`);
  return { root: BigInt(document.root), labels, rejected: document.rejected };
}

/** Blocks searched back for the RootUpdated event when the ASP's status lags (a few minutes here). */
const ROOT_EVENT_LOOKBACK = 10_000n;

/**
 * The CID posted on chain with `root` (RootUpdated event), searched in the recent blocks. The
 * Entrypoint keeps the CID in storage too, but has no getter for the latest index.
 */
async function cidOnChain(client: PublicClient, config: NetworkConfig, root: bigint): Promise<string | null> {
  const latest = await client.getBlockNumber();
  const span = config.logChunk < ROOT_EVENT_LOOKBACK ? config.logChunk : ROOT_EVENT_LOOKBACK;
  const logs = await client.getContractEvents({
    address: config.entrypoint,
    abi: entrypointAbi,
    eventName: "RootUpdated",
    fromBlock: latest - span + 1n,
    toBlock: latest,
  });
  const match = logs.reverse().find((log) => log.args._root === root);
  return match?.args._ipfsCID ?? null;
}

/**
 * The approved set for the root currently on chain. The ASP's status (GET /) names the latest set,
 * but after a new root it can point at the previous one for up to about a minute (Cloudflare KV
 * spreads writes slowly). Then the CID is taken from the chain's RootUpdated event instead. Either
 * way the document is checked against its CID and its root against the chain.
 */
export async function fetchApprovedSet(client: PublicClient, config: NetworkConfig): Promise<ApprovedSet> {
  const [status, onchainRoot] = await Promise.all([
    fetch(`${config.aspUrl}/`).then((response) => response.json() as Promise<{ latest?: { cid: string } }>),
    client.readContract({ address: config.entrypoint, abi: entrypointAbi, functionName: "latestRoot" }),
  ]);
  const statusCid = status.latest?.cid;
  if (statusCid) {
    const document = await fetchSetDocument(config, statusCid);
    if (document.root === onchainRoot) return { cid: statusCid, ...document, root: onchainRoot };
  }

  const cid = await cidOnChain(client, config, onchainRoot);
  if (!cid) throw new Error("ASP set root does not match the root on chain, and no recent RootUpdated event names it");
  const document = await fetchSetDocument(config, cid);
  if (document.root !== onchainRoot) throw new Error(`ASP set ${cid} does not match the root on chain`);
  return { cid, ...document, root: onchainRoot };
}
