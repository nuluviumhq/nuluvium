// Nuluvium relayer (Robinhood Chain testnet).
//   GET  /quote   fee for one piece, relayer address, Router address
//   POST /piece   { withdrawal, proof, scope, order, orderSignature, permit, fee }
//                 simulates Router.relayAndSwap, sends it from the relayer key, waits for the receipt
//   POST /sell    { order, orderSignature, permit, fee }
//                 a fresh address sells stock tokens for USDG: Router.swap, fee out of the USDG
//
// Privacy: nothing is stored and request bodies are never logged. The relayer sees one piece at a
// time; it cannot tell which pieces belong to the same order. Logs are off in wrangler.jsonc.
// Sending goes through one Durable Object so transactions leave in order (no nonce collisions).

import { DurableObject } from "cloudflare:workers";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { quoteFee } from "./fee.js";
import { BadRequest, MAX_BODY_BYTES, parsePiece, parseSell } from "./parse.js";

const routerAbi = parseAbi([
  "struct Withdrawal { address processooor; bytes data; }",
  "struct WithdrawProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[8] pubSignals; }",
  "struct Order { address owner; address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; uint256 maxFee; uint256 nonce; uint256 deadline; }",
  "struct PermitSignature { uint256 deadline; uint8 v; bytes32 r; bytes32 s; }",
  "function relayAndSwap(Withdrawal withdrawal, WithdrawProof proof, uint256 scope, Order order, bytes orderSignature, PermitSignature permit, uint256 fee) returns (uint256)",
  "function swap(Order order, bytes orderSignature, PermitSignature permit, uint256 fee) returns (uint256)",
  "function USDG() view returns (address)",
  "error OrderExpired()",
  "error NonceAlreadyUsed()",
  "error InvalidSignature()",
  "error TokenNotAllowed(address token)",
  "error OneSideMustBeUsdg()",
  "error FeeAboveMax(uint256 fee, uint256 maxFee)",
  "error FeeNotBelowAmount()",
  "error WithdrawalRecipientIsNotOrderOwner()",
  "error RelayAndSwapOnlyBuys()",
  "error EnforcedPause()",
]);

const rpcUrl = (env) => env.PRIVATE_RPC_URL || env.RPC_URL;

function clientsFor(env) {
  const chain = defineChain({
    id: Number(env.CHAIN_ID),
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl(env)] } },
  });
  const transport = http(rpcUrl(env), { timeout: 20_000, retryCount: 1 });
  const account = privateKeyToAccount(env.RELAYER_KEY);
  return {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }),
  };
}

async function currentQuote(env, publicClient) {
  const gasPriceWei = await publicClient.getGasPrice();
  return quoteFee({
    gasPerPiece: BigInt(env.GAS_PER_PIECE),
    gasPriceWei,
    ethUsdCents: BigInt(env.ETH_USD_CENTS),
    marginPercent: BigInt(env.FEE_MARGIN_PERCENT),
    minimumFee: BigInt(env.MINIMUM_FEE),
  });
}

/* ------------------------------------------------------------------ sending, one at a time */

export class RelayQueue extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tail = Promise.resolve();
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    const body = await request.json();
    // Chain every send after the previous one, so each uses the next nonce.
    const run = this.tail.then(() => (pathname === "/sell" ? sendSell(this.env, body) : sendPiece(this.env, parsePiece(body))));
    this.tail = run.catch(() => {});
    try {
      return json(await run);
    } catch (error) {
      return json({ error: error.shortMessage ?? error.message }, error instanceof BadRequest ? 400 : 422);
    }
  }
}

/** Checks the gas float and the fee, simulates `functionName` on the Router, sends it, waits. */
async function sendToRouter(env, functionName, args, fee) {
  const { account, publicClient, walletClient } = clientsFor(env);

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < BigInt(env.MINIMUM_BALANCE_WEI)) throw new Error("relayer gas float too low; try later");

  const { fee: minimumFee } = await currentQuote(env, publicClient);
  if (fee < minimumFee) throw new BadRequest(`fee below the current quote (${minimumFee})`);

  // Simulate first: a transaction that would revert costs the relayer nothing.
  const { request } = await publicClient.simulateContract({ account, address: env.ROUTER, abi: routerAbi, functionName, args });
  const hash = await walletClient.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
  return { tx: hash, gasUsed: receipt.gasUsed.toString(), fee: fee.toString() };
}

async function sendSell(env, body) {
  const { publicClient } = clientsFor(env);
  const usdg = await publicClient.readContract({ address: env.ROUTER, abi: routerAbi, functionName: "USDG" });
  const sell = parseSell(body, usdg);
  return sendToRouter(env, "swap", [sell.order, sell.orderSignature, sell.permit, sell.fee], sell.fee);
}

function sendPiece(env, piece) {
  return sendToRouter(
    env,
    "relayAndSwap",
    [piece.withdrawal, piece.proof, piece.scope, piece.order, piece.orderSignature, piece.permit, piece.fee],
    piece.fee,
  );
}

/* ------------------------------------------------------------------ HTTP */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/quote") {
      const { account, publicClient } = clientsFor(env);
      const { fee, gasCost } = await currentQuote(env, publicClient);
      return json({
        chainId: Number(env.CHAIN_ID),
        router: env.ROUTER,
        relayer: account.address, // put this as feeRecipient in the withdrawal; relay fee 0
        fee: fee.toString(),
        gasCost: gasCost.toString(),
        feeAsset: "USDG (6 decimals)",
      });
    }

    if (request.method === "POST" && (pathname === "/piece" || pathname === "/sell")) {
      let body;
      try {
        const text = await request.text();
        if (text.length > MAX_BODY_BYTES) return json({ error: "request too large" }, 413);
        body = JSON.parse(text);
        // Reject malformed requests before they reach the queue (the sell's USDG check runs there).
        if (pathname === "/piece") parsePiece(body);
        else parseSell(body, body?.order?.tokenOut ?? "");
      } catch (error) {
        return json({ error: error instanceof BadRequest ? error.message : "invalid JSON" }, 400);
      }
      const queue = env.RELAY_QUEUE.get(env.RELAY_QUEUE.idFromName("relayer"));
      return queue.fetch(`https://queue${pathname}`, { method: "POST", body: JSON.stringify(body) });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type" },
      });
    }
    return json({ error: "not found" }, 404);
  },
};
