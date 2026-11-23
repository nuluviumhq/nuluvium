// Nuluvium relayer (Robinhood Chain testnet).
//   GET  /quote   gas fee for one piece, the protocol fee rate, relayer address, Router address,
//                 whether this relayer is active in the RelayerRegistry
//   POST /piece   { withdrawal, proof, scope, order, orderSignature, permit, fee }
//                 simulates Router.relayAndSwap (Router v2), sends it from the relayer key, waits
//   POST /sell    { order, orderSignature, permit, fee }
//                 a fresh address sells stock tokens for USDG: Router.swap, fee out of the USDG
//   cron           checks the gas float; below ALERT_BALANCE_WEI, a Telegram message to the operator
//
// Every order's minimum output is checked against this relayer's own QuoterV2 quote (bound.js).
// Router v2 only accepts pieces from relayers active in the RelayerRegistry (bonded with tNLV on
// testnet). It takes the gas fee plus a 0.1% protocol fee from the USDG side of each piece: half of
// the protocol fee to the relayer that sent it, half to the treasury Safe. Traders never pay NLV.
// Several relayers run this same code with their own key and float (wrangler.jsonc, env "second");
// clients fail over between them.
//
// Privacy: nothing is stored and request bodies are never logged. The relayer sees one piece at a
// time; it cannot tell which pieces belong to the same order. Logs are off in wrangler.jsonc.
// Sending goes through one Durable Object so transactions leave in order (no nonce collisions).

import { DurableObject } from "cloudflare:workers";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { alertDue, floatAlert } from "./alert.js";
import { checkMinimum } from "./bound.js";
import { protocolFeeFor, quoteFee } from "./fee.js";
import { BadRequest, MAX_BODY_BYTES, parsePiece, parseSell } from "./parse.js";

const routerAbi = parseAbi([
  "struct Withdrawal { address processooor; bytes data; }",
  "struct WithdrawProof { uint256[2] pA; uint256[2][2] pB; uint256[2] pC; uint256[8] pubSignals; }",
  "struct Order { address owner; address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; uint256 maxFee; uint256 nonce; uint256 deadline; }",
  "struct PermitSignature { uint256 deadline; uint8 v; bytes32 r; bytes32 s; }",
  "function relayAndSwap(Withdrawal withdrawal, WithdrawProof proof, uint256 scope, Order order, bytes orderSignature, PermitSignature permit, uint256 fee) returns (uint256)",
  "function swap(Order order, bytes orderSignature, PermitSignature permit, uint256 fee) returns (uint256)",
  "function USDG() view returns (address)",
  "function poolFee(address token) view returns (uint24)",
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
  "error NotARegisteredRelayer(address caller)",
  "error TooLittleReceived(uint256 amountOut, uint256 minAmountOut)",
  "error PoolDoesNotExist(address token, uint24 fee)",
]);

const registryAbi = parseAbi(["function isActive(address relayer) view returns (bool)"]);

/** Whether this relayer's key is active in the RelayerRegistry (Router v2 refuses it otherwise). */
const isActive = (env, publicClient, address) =>
  publicClient.readContract({ address: env.REGISTRY, abi: registryAbi, functionName: "isActive", args: [address] });

const quoterAbi = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
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
    // Cron only: whether an alert is due, and remembering that one went out. Holds one timestamp.
    if (pathname === "/alert-due") {
      const due = alertDue(await this.ctx.storage.get("alertSentAt"), Date.now(), Number(this.env.ALERT_EVERY_HOURS));
      if (due) await this.ctx.storage.put("alertSentAt", Date.now());
      return json({ due });
    }
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

/**
 * Quotes the order's swap on QuoterV2 at the Router's tier and refuses a minimum output too far
 * below it. No quote (token not listed, no pool, quoter down) means no piece: fails closed.
 */
async function checkPriceProtection(env, publicClient, order, fee, isBuy) {
  const stock = isBuy ? order.tokenOut : order.tokenIn;
  let quoted;
  try {
    const tier = await publicClient.readContract({ address: env.ROUTER, abi: routerAbi, functionName: "poolFee", args: [stock] });
    if (tier === 0) throw new Error("not listed");
    // A buy swaps what is left after the gas fee and the protocol fee (Router v2 _buy).
    const amountIn = isBuy ? order.amountIn - fee - protocolFeeFor(order.amountIn, BigInt(env.PROTOCOL_FEE_BPS)) : order.amountIn;
    const { result } = await publicClient.simulateContract({
      address: env.QUOTER,
      abi: quoterAbi,
      functionName: "quoteExactInputSingle",
      args: [{ tokenIn: order.tokenIn, tokenOut: order.tokenOut, amountIn, fee: tier, sqrtPriceLimitX96: 0n }],
    });
    quoted = result[0];
  } catch {
    throw new BadRequest("no price quote for this token right now; not sent");
  }
  checkMinimum({
    isBuy,
    minAmountOut: order.minAmountOut,
    maxFee: order.maxFee,
    quoted,
    maxSlippageBps: BigInt(env.MAX_SLIPPAGE_BPS),
    protocolFeeBps: BigInt(env.PROTOCOL_FEE_BPS),
  });
}

/**
 * Checks the registry, the gas float, the fee and the price limit, simulates `functionName`, sends
 * it, waits.
 */
async function sendToRouter(env, functionName, args, order, fee) {
  const { account, publicClient, walletClient } = clientsFor(env);

  const [active, balance] = await Promise.all([isActive(env, publicClient, account.address), publicClient.getBalance({ address: account.address })]);
  // Unbonding, removed or never registered: Router v2 would revert, so the client tries another relayer.
  if (!active) throw new Error("this relayer is not active in the registry; try another");
  if (balance < BigInt(env.MINIMUM_BALANCE_WEI)) throw new Error("relayer gas float too low; try later");

  const { fee: minimumFee } = await currentQuote(env, publicClient);
  if (fee < minimumFee) throw new BadRequest(`fee below the current quote (${minimumFee})`);
  await checkPriceProtection(env, publicClient, order, fee, functionName === "relayAndSwap");

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
  return sendToRouter(env, "swap", [sell.order, sell.orderSignature, sell.permit, sell.fee], sell.order, sell.fee);
}

function sendPiece(env, piece) {
  return sendToRouter(
    env,
    "relayAndSwap",
    [piece.withdrawal, piece.proof, piece.scope, piece.order, piece.orderSignature, piece.permit, piece.fee],
    piece.order,
    piece.fee,
  );
}

/* ------------------------------------------------------------------ gas float alert (cron) */

async function checkFloat(env) {
  const { account, publicClient } = clientsFor(env);
  const [balance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account.address }), publicClient.getGasPrice()]);
  const text = floatAlert({
    name: env.RELAYER_NAME,
    address: account.address,
    balance,
    alertBelow: BigInt(env.ALERT_BALANCE_WEI),
    refuseBelow: BigInt(env.MINIMUM_BALANCE_WEI),
    gasPerPiece: BigInt(env.GAS_PER_PIECE),
    gasPrice,
  });
  // No alert channel set up: nothing to send to (the float is also on the stats page).
  if (!text || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const queue = env.RELAY_QUEUE.get(env.RELAY_QUEUE.idFromName("relayer"));
  const { due } = await (await queue.fetch("https://queue/alert-due", { method: "POST" })).json();
  if (!due) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

/* ------------------------------------------------------------------ HTTP */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(checkFloat(env).catch(() => {})); // logs are off; a failed check runs again next time
  },

  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/quote") {
      const { account, publicClient } = clientsFor(env);
      const [{ fee, gasCost }, active] = await Promise.all([currentQuote(env, publicClient), isActive(env, publicClient, account.address).catch(() => null)]);
      return json({
        chainId: Number(env.CHAIN_ID),
        router: env.ROUTER,
        registry: env.REGISTRY,
        relayer: account.address, // put this as feeRecipient in the withdrawal; relay fee 0
        name: env.RELAYER_NAME,
        // null when the registry could not be read just now
        active,
        // Gas fee per piece, in USDG units.
        fee: fee.toString(),
        gasCost: gasCost.toString(),
        // On top of the gas fee: the Router takes this share of the USDG side of each piece
        // (protocolFeeFor = amount × bps / 10,000); relayerShareBps of it goes to the sending relayer.
        protocolFeeBps: Number(env.PROTOCOL_FEE_BPS),
        relayerShareBps: Number(env.RELAYER_SHARE_BPS),
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
