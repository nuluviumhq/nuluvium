// Chain access for the browser. The SDK (with the Privacy Pools library and snarkjs) is loaded only
// when needed, so the first page load stays small. Every read goes through our /api/rpc proxy.

import type { NetworkConfig, UserKeys } from "@nuluvium/sdk";
import { reasonCode, type ReasonCode } from "./reasons.ts";

// Browser only. Next replaces `typeof window` with "undefined" in server builds, so this branch and
// the whole SDK (snarkjs, ethers, poseidon constants: ~2.6 MB) are dropped from the Worker bundle.
// Every caller runs in effects or event handlers, never during server rendering.
export const sdk = (): Promise<typeof import("@nuluvium/sdk")> =>
  typeof window === "undefined" ? Promise.reject(new Error("The SDK runs in the browser only")) : import("@nuluvium/sdk");

/** Testnet config with reads through /api/rpc (Alchemy behind it: 10,000 blocks per log query). */
export async function browserConfig(): Promise<NetworkConfig> {
  const { ROBINHOOD_TESTNET } = await sdk();
  return { ...ROBINHOOD_TESTNET, rpcUrl: `${window.location.origin}/api/rpc`, logChunk: 10_000n };
}

export type Approval = "approved" | "waiting" | "rejected";

export interface ShieldedNote {
  depositIndex: bigint;
  value: bigint;
  withdrawals: number;
  /** Wallet that made the deposit: only it can take the deposit back (ragequit). */
  depositor: `0x${string}`;
  /** ASP decision on the deposit: only approved notes can be spent privately. */
  approval: Approval;
  /** Why it was not approved (only for rejected notes). */
  reason?: ReasonCode | null;
}

export interface ShieldedBalance {
  total: bigint;
  /** Spendable now: approved notes only. */
  approved: bigint;
  notes: ShieldedNote[];
}

/**
 * The user's shielded balance, rebuilt from the chain with their keys (nothing secret is sent
 * anywhere), with the approved-set decision for each note.
 */
export async function readShieldedBalance(keys: UserKeys): Promise<ShieldedBalance> {
  const { fetchApprovedSet, publicClientFor, recoverNotes } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const [{ spendable }, set] = await Promise.all([recoverNotes(client, config, keys), fetchApprovedSet(client, config).catch(() => null)]);
  const notes: ShieldedNote[] = spendable.map((note) => {
    const rejected = set?.rejected.find((entry) => entry.label === note.label.toString());
    const approval: Approval = set?.labels.includes(note.label) ? "approved" : rejected ? "rejected" : "waiting";
    return { depositIndex: note.depositIndex, value: note.value, withdrawals: note.withdrawals, depositor: note.depositor, approval, reason: rejected ? reasonCode(rejected) : undefined };
  });
  return {
    total: notes.reduce((sum, note) => sum + note.value, 0n),
    approved: notes.filter((note) => note.approval === "approved").reduce((sum, note) => sum + note.value, 0n),
    notes,
  };
}

/** "12.5" or "12.50" → tUSDG units; null when not a positive amount with at most 6 decimals. */
export function parseUsdg(text: string): bigint | null {
  const match = text.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) return null;
  const units = BigInt(match[1]!) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return units > 0n ? units : null;
}

/** USDG units (6 decimals) as "1,234.50". */
/** Units → text for an amount field: no thousands separators, rounded down to whole cents. */
export function unitsToInput(units: bigint): string {
  const cents = units / 10_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function formatUsdg(units: bigint): string {
  const whole = units / 1_000_000n;
  const cents = (units % 1_000_000n) / 10_000n;
  return `${whole.toLocaleString("en-US")}.${cents.toString().padStart(2, "0")}`;
}

/** tUSDG and ETH in the person's wallet (public), for the deposit form. */
export async function readWalletFunds(address: `0x${string}`): Promise<{ usdg: bigint; eth: bigint }> {
  const { publicClientFor } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const [usdg, eth] = await Promise.all([
    client.readContract({
      address: config.usdg,
      abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] }],
      functionName: "balanceOf",
      args: [address],
    }),
    client.getBalance({ address }),
  ]);
  return { usdg, eth };
}

export interface PublicPiece {
  token: `0x${string}`;
  usdgIn: bigint;
  tokenOut: bigint;
  /** Relayer gas fee. */
  fee: bigint;
  /** Router v2 protocol fee (0 on Router v1 swaps). */
  protocolFee: bigint;
  owner: `0x${string}`;
  tx: `0x${string}`;
  block: bigint;
}

const swappedV1 = {
  type: "event",
  name: "Swapped",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: true },
    { name: "tokenIn", type: "address", indexed: false },
    { name: "tokenOut", type: "address", indexed: false },
    { name: "amountIn", type: "uint256", indexed: false },
    { name: "amountOut", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
    { name: "feeRecipient", type: "address", indexed: false },
  ],
} as const;

const swappedV2 = {
  type: "event",
  name: "Swapped",
  inputs: [
    { name: "owner", type: "address", indexed: true },
    { name: "nonce", type: "uint256", indexed: true },
    { name: "tokenIn", type: "address", indexed: false },
    { name: "tokenOut", type: "address", indexed: false },
    { name: "amountIn", type: "uint256", indexed: false },
    { name: "amountOut", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
    { name: "protocolFee", type: "uint256", indexed: false },
    { name: "relayer", type: "address", indexed: true },
  ],
} as const;

/**
 * The latest Router swaps, as anyone sees them on chain (fresh addresses, not linked): Router v2
 * first, then the earlier Router while fewer than `limit` are found.
 */
export async function readRecentPieces(limit = 4): Promise<PublicPiece[]> {
  const { publicClientFor } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const latest = await client.getBlockNumber();
  const found: PublicPiece[] = [];
  const routers = [{ address: config.router, v2: true }, ...config.previousRouters.map((address) => ({ address, v2: false }))];
  for (const router of routers) {
    let to = latest;
    // Walk back in proxy-sized chunks until enough swaps are found (at most 10 chunks per Router).
    for (let chunk = 0; chunk < 10 && found.length < limit; chunk++) {
      const from = to - config.logChunk + 1n;
      if (router.v2) {
        const logs = await client.getLogs({ address: router.address, event: swappedV2, fromBlock: from, toBlock: to });
        for (const log of logs.reverse()) {
          const { tokenOut, amountIn, amountOut, fee, protocolFee, owner } = log.args;
          found.push({ token: tokenOut!, usdgIn: amountIn!, tokenOut: amountOut!, fee: fee!, protocolFee: protocolFee!, owner: owner!, tx: log.transactionHash, block: log.blockNumber });
        }
      } else {
        const logs = await client.getLogs({ address: router.address, event: swappedV1, fromBlock: from, toBlock: to });
        for (const log of logs.reverse()) {
          const { tokenOut, amountIn, amountOut, fee, owner } = log.args;
          found.push({ token: tokenOut!, usdgIn: amountIn!, tokenOut: amountOut!, fee: fee!, protocolFee: 0n, owner: owner!, tx: log.transactionHash, block: log.blockNumber });
        }
      }
      to = from - 1n;
    }
  }
  return found.slice(0, limit);
}

/**
 * Output of a swap at a fresh QuoterV2 quote on the Router's pool: tokens for `amountIn` tUSDG
 * (buy), or tUSDG for `amountIn` tokens (sell). An eth_call through /api/rpc; nothing is sent.
 */
export async function quoteOut(direction: "buy" | "sell", token: `0x${string}`, amountIn: bigint): Promise<bigint> {
  const { publicClientFor, quoteSwap } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  return direction === "buy" ? quoteSwap(client, config, config.usdg, token, amountIn) : quoteSwap(client, config, token, config.usdg, amountIn);
}

/** Relayer gas fee per piece right now, in tUSDG units (from the first relayer that answers). */
export async function readPieceFee(): Promise<bigint> {
  const { getQuote } = await sdk();
  return (await getQuote(await browserConfig())).fee;
}

/** Protocol fee per piece: 0.1% of its tUSDG (Router v2), half to the relayer and half to the treasury. */
export const PROTOCOL_FEE_BPS = 10n;
export const protocolFeeOf = (usdgAmount: bigint) => (usdgAmount * PROTOCOL_FEE_BPS) / 10_000n;
