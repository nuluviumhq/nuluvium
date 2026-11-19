#!/usr/bin/env node
// Nuluvium MCP server (stdio). Runs on the agent's own machine: the secret, the notes and the
// order schedule never leave it. Pieces are sent through the Nuluvium relayer.
//
// Environment:
//   NULUVIUM_MNEMONIC   required. The agent's secret (BIP-39). Never printed or returned.
//   NULUVIUM_NETWORK    default "robinhood-testnet"
//   NULUVIUM_RPC_URL    optional own RPC (may hold an API key; never printed)
//   NULUVIUM_LOG_CHUNK  blocks per log query with NULUVIUM_RPC_URL (default 10000, Alchemy limit)
//   NULUVIUM_HOME       default ~/.nuluvium (order schedule; local only)
//   NULUVIUM_ARTIFACTS  circuit files folder. Default: testnet/artifacts when run from the source
//                       tree with the files there, else ~/.nuluvium/artifacts (downloaded once)

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatUnits } from "viem";
import { z } from "zod";
import { depositAccount, depositUsdg, erc20Abi, keysFromMnemonic, planPieces, walletClientFor } from "../../sdk/src/index.ts";
import { noteApproval, pickNote } from "./approval.ts";
import { ensureArtifacts, missingArtifacts } from "./artifacts.ts";
import { depositProblem } from "./deposit.ts";
import { Engine } from "./engine.ts";
import { NETWORKS } from "./networks.ts";
import { OrderStore, orderStatus, type StoredOrder } from "./store.ts";

// stdout carries the MCP protocol; anything a library prints must go to stderr.
console.log = console.error;
console.info = console.error;

const USDG = 1_000_000n;
const MIN_PIECE = 1n * USDG;
const START_DELAY_SECONDS = 30;

const networkName = process.env.NULUVIUM_NETWORK ?? "robinhood-testnet";
const baseNetwork = NETWORKS[networkName];
if (!baseNetwork) throw new Error(`unknown NULUVIUM_NETWORK ${networkName}`);
// Own RPC (e.g. Alchemy): needed where the public *.robinhood.com RPC is unreachable (some ISPs
// block the domain) or rate-limited. Alchemy accepts at most 10,000 blocks per log query.
const rpcOverride = process.env.NULUVIUM_RPC_URL;
const network = rpcOverride
  ? {
      ...baseNetwork,
      config: {
        ...baseNetwork.config,
        rpcUrl: rpcOverride,
        logChunk: BigInt(process.env.NULUVIUM_LOG_CHUNK ?? 10_000),
      },
    }
  : baseNetwork;
delete process.env.NULUVIUM_RPC_URL; // may contain an API key

const home = process.env.NULUVIUM_HOME ?? join(homedir(), ".nuluvium");
const sourceArtifacts = fileURLToPath(new URL("../../testnet/artifacts", import.meta.url));
const artifacts =
  process.env.NULUVIUM_ARTIFACTS ??
  (existsSync(sourceArtifacts) && missingArtifacts(sourceArtifacts).length === 0 ? sourceArtifacts : join(home, "artifacts"));

// `npx -y @nuluvium/mcp --prepare`: one-time setup before adding the server to an MCP client. The
// first npx run installs the package (over a minute, longer than many clients wait for a server to
// start) and the circuit files are 23 MB; doing both here makes later starts take seconds.
// Needs no secret.
if (process.argv.includes("--prepare")) {
  await ensureArtifacts(artifacts, network.artifactsUrl, (message) => console.error(`[nuluvium] ${message}`));
  console.error(`[nuluvium] ready: package installed, circuit files in ${artifacts}. Add the server to your MCP client now.`);
  process.exit(0);
}

const mnemonic = process.env.NULUVIUM_MNEMONIC;
if (!mnemonic) throw new Error("NULUVIUM_MNEMONIC is not set");
const keys = keysFromMnemonic(mnemonic);
delete process.env.NULUVIUM_MNEMONIC; // keep it out of anything that dumps the environment
// The agent's own wallet: pays for deposits (public, so this is the address linked to the agent).
const depositWallet = depositAccount(keys);
// One download at a time; a failed one is tried again before the next piece.
let artifactsReady: Promise<void> | null = null;
const prepareProver = () => {
  artifactsReady ??= ensureArtifacts(artifacts, network.artifactsUrl, (message) => console.error(`[nuluvium] ${message}`)).catch((error) => {
    artifactsReady = null;
    throw error;
  });
  return artifactsReady;
};
const store = new OrderStore(home, networkName);
const engine = new Engine(network, keys, store, artifacts, prepareProver);

const usdg = (units: bigint | string) => `${formatUnits(BigInt(units), 6)} USDG`;
const clock = (unix: number) => new Date(unix * 1000).toISOString().replace(".000Z", "Z");
const reply = (body: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] });
const failure = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/**
 * Wraps a tool so errors reach the agent as a short message only. viem error messages include the
 * RPC URL, which can hold an API key, so the full message is never returned.
 */
function safe<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result>) {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const short = (error as { shortMessage?: string }).shortMessage;
      const details = (error as { details?: string }).details;
      const message = short ? `${short}${details ? ` (${details})` : ""}` : error instanceof Error ? error.message : String(error);
      return failure(`Nuluvium error: ${message.replace(/https?:\/\/\S+/g, "<rpc>")}`);
    }
  };
}

function describe(order: StoredOrder) {
  const done = order.pieces.filter((piece) => piece.status === "done");
  return {
    orderId: order.id,
    status: orderStatus(order),
    token: order.token,
    amount: usdg(order.amount),
    pieces: order.pieces.map((piece) => ({
      piece: piece.number,
      amount: usdg(piece.amount),
      scheduledFor: clock(piece.at),
      status: piece.status,
      ...(piece.error ? { error: piece.error } : {}),
    })),
    routed: usdg(done.reduce((sum, piece) => sum + BigInt(piece.amount), 0n)),
    createdAt: clock(order.createdAt),
  };
}

/** USDG and ETH in the deposit wallet. */
async function walletFunds() {
  const client = engine.ctx.client;
  const [usdgBalance, eth] = await Promise.all([
    client.readContract({ address: network.config.usdg, abi: erc20Abi, functionName: "balanceOf", args: [depositWallet.address] }),
    client.getBalance({ address: depositWallet.address }),
  ]);
  return { usdg: usdgBalance, eth };
}

const server = new McpServer({ name: "nuluvium", version: "0.1.0" });

server.registerTool(
  "get_balance",
  {
    title: "Shielded balance",
    description:
      "Shows the agent's shielded USDG balance on Nuluvium, per note, and the deposit wallet that funds new deposits. One order is paid from one note, so the largest note is the largest order you can route right now.",
  },
  safe(async () => {
    const [notes, funds, set] = await Promise.all([engine.notes(), walletFunds(), engine.approvedSet()]);
    const busy = new Set(store.all().filter((order) => ["scheduled", "routing"].includes(orderStatus(order))).map((order) => order.depositIndex));
    // No approved set read yet (the ASP is mid-update): statuses are unknown, the balance still shows.
    const rows = notes.map((note) => ({ note, ...(set ? noteApproval(note, set) : { approval: "unknown" as const, reason: undefined }) }));
    return reply({
      network: network.name,
      ...(set ? {} : { statusNote: "The clean-funds list is updating; note statuses are unknown for now. Try again in about a minute." }),
      total: usdg(notes.reduce((sum, note) => sum + note.value, 0n)),
      approvedTotal: usdg(rows.filter((row) => row.approval === "approved").reduce((sum, row) => sum + row.note.value, 0n)),
      notes: rows.map(({ note, approval, reason }) => ({
        note: Number(note.depositIndex),
        balance: usdg(note.value),
        status: approval,
        ...(reason ? { reason } : {}),
        inUseByAnOrder: busy.has(note.depositIndex.toString()),
      })),
      depositWallet: { address: depositWallet.address, usdg: usdg(funds.usdg), eth: formatUnits(funds.eth, 18) },
      tradableTokens: Object.values(network.tokens).map((token) => ({ symbol: token.symbol, note: token.note })),
    });
  }),
);

server.registerTool(
  "deposit",
  {
    title: "Deposit USDG into the shielded balance",
    description:
      "Moves USDG from the agent's deposit wallet (see get_balance) into its shielded balance as a new note. The deposit itself is public: anyone can see this wallet deposited this amount; what the note pays for later is not linked to it. Sends two transactions (approve, deposit) and waits for them. The new note can pay for orders once the clean-funds check approves it, usually within a minute. Up to 1,000 USDG per deposit until the audit.",
    inputSchema: {
      usdgAmount: z.number().positive().describe("USDG to deposit (1 to 1,000)"),
    },
  },
  safe(async ({ usdgAmount }) => {
    const amount = BigInt(Math.round(usdgAmount * 1e6));
    const problem = depositProblem(amount, await walletFunds(), depositWallet.address, network.faucet);
    if (problem) return failure(problem);
    const wallet = walletClientFor(network.config, depositWallet);
    const { note, tx } = await depositUsdg(engine.ctx.client, wallet, network.config, keys, amount);
    return reply({
      deposited: usdg(note.value),
      note: Number(note.depositIndex),
      from: depositWallet.address,
      transaction: `${network.explorer}/tx/${tx}`,
      next: "Wait about a minute for the clean-funds check, then route_order can pay from this note.",
    });
  }),
);

server.registerTool(
  "route_order",
  {
    title: "Route a private buy order",
    description:
      "Buys a stock token with shielded USDG, split into pieces of random size sent at random times inside the window. Each piece goes to its own fresh address, so the trades do not trace back to the agent's wallet. Returns at once; pieces are sent in the background (check with get_orders / get_fills). Privacy is from other readers of the chain, not from Robinhood.",
    inputSchema: {
      token: z.string().describe("Symbol of an allowlisted stock token, e.g. MSTK on testnet"),
      usdgAmount: z.number().positive().describe("Total USDG to spend"),
      pieces: z.number().int().min(1).max(20).default(5).describe("How many pieces (1 to 20)"),
      windowMinutes: z.number().min(1).max(1440).default(10).describe("Spread the pieces over this many minutes"),
      maxSlippagePercent: z.number().min(0.1).max(5).default(1).describe("Worst price accepted per piece, in percent"),
    },
  },
  safe(async ({ token, usdgAmount, pieces, windowMinutes, maxSlippagePercent }) => {
    const target = network.tokens[token.toUpperCase()];
    if (!target) return failure(`${token} is not tradable here. Tradable: ${Object.keys(network.tokens).join(", ")}`);
    const amount = BigInt(Math.round(usdgAmount * 1e6));
    if (amount < MIN_PIECE * BigInt(pieces)) return failure(`Each piece must be at least ${usdg(MIN_PIECE)}; lower the piece count or raise the amount.`);

    // Pay from the smallest approved, free note that covers the order.
    const busy = new Set(store.all().filter((order) => ["scheduled", "routing"].includes(orderStatus(order))).map((order) => order.depositIndex));
    const [notes, set] = await Promise.all([engine.notes(), engine.approvedSet()]);
    if (!set) return failure("The clean-funds list is updating, so it is not clear yet which notes may pay. Try again in about a minute.");
    const picked = pickNote(notes, set, busy, amount);
    if ("problem" in picked) return failure(picked.problem);
    const { note } = picked;

    const start = Math.floor(Date.now() / 1000) + START_DELAY_SECONDS;
    const windowSeconds = Math.round(windowMinutes * 60);
    const minGapSeconds = Math.min(30, Math.floor(windowSeconds / Math.max(1, pieces - 1)));
    const plan = planPieces({ amount, pieces, windowSeconds, start, minPiece: MIN_PIECE, minGapSeconds });

    const order: StoredOrder = {
      id: `ord_${crypto.randomUUID().slice(0, 8)}`,
      network: networkName,
      token: target.symbol,
      amount: amount.toString(),
      depositIndex: note.depositIndex.toString(),
      slippageBps: Math.round(maxSlippagePercent * 100),
      createdAt: Math.floor(Date.now() / 1000),
      pieces: plan.map((piece) => ({ number: piece.number, amount: piece.amount.toString(), at: piece.at, status: "scheduled" })),
    };
    store.add(order);
    for (const piece of order.pieces) engine.arm(order, piece.number);
    return reply({ ...describe(order), paidFromNote: Number(note.depositIndex), noteBalanceAfter: usdg(note.value - amount) });
  }),
);

server.registerTool(
  "cancel_order",
  {
    title: "Cancel an order",
    description: "Cancels the pieces of an order that have not been sent yet. A piece already being sent may still complete.",
    inputSchema: { orderId: z.string().describe("Order id from route_order or get_orders") },
  },
  safe(async ({ orderId }) => {
    const order = store.get(orderId);
    if (!order) return failure(`No order ${orderId}`);
    const cancelled = engine.cancel(order);
    return reply({ ...describe(order), cancelledPieces: cancelled });
  }),
);

server.registerTool(
  "get_orders",
  {
    title: "List orders",
    description: "Lists this agent's orders with the status of every piece (scheduled, sending, done, failed, cancelled).",
    inputSchema: { onlyOpen: z.boolean().default(false).describe("Only orders still scheduled or routing") },
  },
  safe(async ({ onlyOpen }) => {
    const orders = store.all().filter((order) => !onlyOpen || ["scheduled", "routing"].includes(orderStatus(order)));
    return reply({ network: network.name, orders: orders.map(describe) });
  }),
);

server.registerTool(
  "get_fills",
  {
    title: "Executed pieces",
    description: "Shows executed pieces: USDG spent, tokens received, the fresh address holding them, and the transaction link.",
    inputSchema: { orderId: z.string().optional().describe("Limit to one order") },
  },
  safe(async ({ orderId }) => {
    const orders = orderId ? [store.get(orderId)].filter((order): order is StoredOrder => Boolean(order)) : store.all();
    if (orderId && orders.length === 0) return failure(`No order ${orderId}`);
    const fills = orders.flatMap((order) =>
      order.pieces
        .filter((piece) => piece.status === "done")
        .map((piece) => {
          const token = network.tokens[order.token]!;
          return {
            orderId: order.id,
            piece: piece.number,
            spent: usdg(piece.amount),
            relayerFee: usdg(piece.fee ?? "0"),
            received: `${formatUnits(BigInt(piece.received ?? "0"), token.decimals)} ${token.symbol}`,
            freshAddress: piece.fresh,
            transaction: `${network.explorer}/tx/${piece.tx}`,
            at: piece.sentAt ? clock(piece.sentAt) : undefined,
          };
        }),
    );
    return reply({ fills });
  }),
);

engine.resumeAll();
await server.connect(new StdioServerTransport());
// Start the circuit download now (in the background) so the first piece does not wait for it.
prepareProver().catch((error) => console.error(`[nuluvium] ${error instanceof Error ? error.message : String(error)}; will retry before the first piece`));
console.error(`[nuluvium] MCP server ready on ${network.name}; orders in ${store.file}`);
