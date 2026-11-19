import { createPublicClient, createWalletClient, defineChain, http, parseAbi, type AbiEvent, type Account, type PublicClient, type WalletClient } from "viem";
import type { NetworkConfig } from "./config.ts";

export const poolAbi = parseAbi([
  "event Deposited(address indexed _depositor, uint256 _commitment, uint256 _label, uint256 _value, uint256 _precommitmentHash)",
  "event Withdrawn(address indexed _processooor, uint256 _value, uint256 _spentNullifier, uint256 _newCommitment)",
  "event Ragequit(address indexed _ragequitter, uint256 _commitment, uint256 _label, uint256 _value)",
  "event LeafInserted(uint256 _index, uint256 _leaf, uint256 _root)",
  "function currentRoot() view returns (uint256)",
]);

export const entrypointAbi = parseAbi([
  "function deposit(address asset, uint256 value, uint256 precommitment) returns (uint256)",
  "function latestRoot() view returns (uint256)",
  "event RootUpdated(uint256 _root, string _ipfsCID, uint256 _timestamp)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function nonces(address owner) view returns (uint256)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
]);

export function chainFor(config: NetworkConfig) {
  return defineChain({
    id: config.chainId,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  });
}

export function publicClientFor(config: NetworkConfig): PublicClient {
  return createPublicClient({ chain: chainFor(config), transport: http(config.rpcUrl, { timeout: 30_000, retryCount: 2 }) });
}

/** A wallet client that signs locally with `account` and sends through the network's RPC. */
export function walletClientFor(config: NetworkConfig, account: Account): WalletClient {
  return createWalletClient({ account, chain: chainFor(config), transport: http(config.rpcUrl, { timeout: 30_000, retryCount: 2 }) });
}

type PoolEventName = "Deposited" | "Withdrawn" | "Ragequit" | "LeafInserted";

export interface PoolLog {
  eventName: PoolEventName;
  args: Record<string, bigint | `0x${string}`>;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: `0x${string}`;
}

/** Parallel requests per scan: fast enough in a browser, gentle on the RPC. */
const SCAN_CONCURRENCY = 4;

/**
 * Logs of the given pool events since the deployment, in chain order. The block range is cut into
 * chunks the RPC accepts; chunks are fetched a few at a time, all event types in one request each.
 */
export async function poolLogs(client: PublicClient, config: NetworkConfig, eventNames: PoolEventName[]): Promise<PoolLog[]> {
  const events = poolAbi.filter((item) => item.type === "event" && eventNames.includes(item.name as PoolEventName)) as AbiEvent[];
  const latest = await client.getBlockNumber();
  const ranges: Array<[bigint, bigint]> = [];
  for (let from = config.deployBlock; from <= latest; from += config.logChunk) {
    ranges.push([from, from + config.logChunk - 1n < latest ? from + config.logChunk - 1n : latest]);
  }
  const chunks: PoolLog[][] = new Array(ranges.length);
  let next = 0;
  const worker = async () => {
    while (next < ranges.length) {
      const index = next++;
      const [fromBlock, toBlock] = ranges[index]!;
      chunks[index] = (await client.getLogs({ address: config.pool, events, fromBlock, toBlock, strict: true })) as unknown as PoolLog[];
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, ranges.length) }, worker));
  return chunks.flat().sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));
}

/** All logs of one pool event since the deployment, in chain order. */
export function poolEvents(client: PublicClient, config: NetworkConfig, eventName: PoolEventName): Promise<PoolLog[]> {
  return poolLogs(client, config, [eventName]);
}
