// Exit check: ragequit and gasless sell, through the SDK, on Robinhood Chain testnet.
//   1. Deposits 2 tUSDG from the deployer under the PUBLIC test wallet's Nuluvium keys (as
//      web-login-check.ts does), waits, then takes it back with ragequitNote from the deployer (the
//      depositor). Checks the note is then spent with its ragequit transaction.
//   2. Finds a fresh address of those keys that holds MSTK and sells it with the SDK's order and
//      permit, sending Router.swap from the deployer in the relayer's place (the HTTP endpoint is
//      covered by relayer/test/parse.test.js). Checks the tUSDG landed on the fresh address.
// Testnet only; the test wallet is public on purpose. Usage (from testnet/): node exit-check.ts

import { createWalletClient, http, parseAbi, type Hex } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import {
  ROBINHOOD_TESTNET,
  chainFor,
  depositUsdg,
  freshAccount,
  getQuote,
  keyMessage,
  keysFromSignature,
  publicClientFor,
  ragequitNote,
  randomNonce,
  recoverNotes,
  signOrder,
  signPermit,
  type Order,
} from "../sdk/src/index.ts";
import { createFolderProver } from "../sdk/src/node.ts";
import { devVar, devVarOptional } from "./recover.ts";

const MSTK = "0xf2a0289ec25994dC7d22461Afd1dF3B818A0E088";
const MOCK_USDG_PER_MSTK = 180_000_000n;
const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const routerAbi = parseAbi([
  "struct Order { address owner; address tokenIn; address tokenOut; uint256 amountIn; uint256 minAmountOut; uint256 maxFee; uint256 nonce; uint256 deadline; }",
  "struct PermitSignature { uint256 deadline; uint8 v; bytes32 r; bytes32 s; }",
  "function swap(Order order, bytes orderSignature, PermitSignature permit, uint256 fee) returns (uint256)",
]);
const link = (tx: string) => `https://explorer.testnet.chain.robinhood.com/tx/${tx}`;

const testWallet = mnemonicToAccount("test test test test test test test test test test test junk");
const keys = keysFromSignature(await testWallet.signMessage({ message: keyMessage(testWallet.address, ROBINHOOD_TESTNET.chainId) }));
const rpcUrl = devVarOptional("TESTNET_RPC_URL");
const config = rpcUrl ? { ...ROBINHOOD_TESTNET, rpcUrl, logChunk: 10_000n } : ROBINHOOD_TESTNET;
const client = publicClientFor(config);
const deployer = privateKeyToAccount(devVar("TESTNET_DEPLOYER_KEY") as Hex);
const wallet = createWalletClient({ account: deployer, chain: chainFor(config), transport: http(config.rpcUrl) });
const send = async (hash: Hex) => {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted: ${link(hash)}`);
  return receipt;
};

try {
  console.log("1. Ragequit");
  await send(await wallet.writeContract({ address: config.usdg, abi: parseAbi(["function mint(address to, uint256 amount)"]), functionName: "mint", args: [deployer.address, 2_000_000n] }));
  const { note, tx: depositTx } = await depositUsdg(client, wallet, config, keys, 2_000_000n);
  console.log(`  deposit #${note.depositIndex} of 2 tUSDG: ${link(depositTx)}`);
  const before = await client.readContract({ address: config.usdg, abi: balanceAbi, functionName: "balanceOf", args: [deployer.address] });
  const { tx: quitTx, value } = await ragequitNote(client, wallet, config, createFolderProver(new URL("./artifacts/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), note);
  const after = await client.readContract({ address: config.usdg, abi: balanceAbi, functionName: "balanceOf", args: [deployer.address] });
  console.log(`  ragequit ${Number(value) / 1e6} tUSDG: ${link(quitTx)}; wallet got ${Number(after - before) / 1e6}`);
  const { spendable, spent } = await recoverNotes(client, config, keys);
  const rebuilt = spent.find((item) => item.depositIndex === note.depositIndex);
  if (!rebuilt?.ragequitTx || spendable.some((item) => item.depositIndex === note.depositIndex)) throw new Error("recoverNotes still counts the ragequit deposit as spendable");
  console.log(`  recoverNotes: deposit #${note.depositIndex} spent, ragequitTx ${rebuilt.ragequitTx.slice(0, 10)}…  OK`);

  console.log("2. Sell from a fresh address");
  const places = [...spendable, ...spent].flatMap((item) => Array.from({ length: item.withdrawals }, (_, piece) => freshAccount(keys, item.depositIndex, piece)));
  let seller: (typeof places)[number] | undefined;
  let amount = 0n;
  for (const account of places) {
    amount = await client.readContract({ address: MSTK, abi: balanceAbi, functionName: "balanceOf", args: [account.address] });
    if (amount > 0n) {
      seller = account;
      break;
    }
  }
  if (!seller) {
    console.log(`  none of ${places.length} fresh addresses holds MSTK; buy a piece in the app first`);
  } else {
    const quote = await getQuote(config);
    const value = (amount * MOCK_USDG_PER_MSTK) / 10n ** 18n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
    const order: Order = { owner: seller.address, tokenIn: MSTK, tokenOut: config.usdg, amountIn: amount, minAmountOut: (value * 99n) / 100n - quote.fee * 2n, maxFee: quote.fee * 2n, nonce: randomNonce(), deadline };
    const [orderSignature, permit] = await Promise.all([signOrder(seller, config, order), signPermit(seller, client, config, MSTK, config.router, amount, deadline)]);
    const usdgBefore = await client.readContract({ address: config.usdg, abi: balanceAbi, functionName: "balanceOf", args: [seller.address] });
    const tx = await wallet.writeContract({
      address: config.router,
      abi: routerAbi,
      functionName: "swap",
      args: [order, orderSignature, { deadline: BigInt(permit.deadline), v: Number(permit.v), r: permit.r, s: permit.s }, quote.fee],
    });
    await send(tx);
    const [mstkAfter, usdgAfter, eth] = await Promise.all([
      client.readContract({ address: MSTK, abi: balanceAbi, functionName: "balanceOf", args: [seller.address] }),
      client.readContract({ address: config.usdg, abi: balanceAbi, functionName: "balanceOf", args: [seller.address] }),
      client.getBalance({ address: seller.address }),
    ]);
    console.log(`  sold ${Number(amount) / 1e18} MSTK on ${seller.address}: ${link(tx)}`);
    console.log(`  tUSDG on the fresh address +${Number(usdgAfter - usdgBefore) / 1e6} (sale ${Number(value) / 1e6} minus fee ${Number(quote.fee) / 1e6}); MSTK left ${mstkAfter}; ETH ${eth}`);
    if (mstkAfter !== 0n || usdgAfter - usdgBefore !== value - quote.fee) throw new Error("sale amounts do not match");
    console.log("  OK");
  }
} catch (error) {
  // Never print viem's full message: it contains the RPC URL with its key.
  console.error("FAILED:", (error as { shortMessage?: string }).shortMessage ?? (error instanceof Error ? error.message.split("\n")[0] : error));
  process.exitCode = 1;
}
// snarkjs keeps worker threads alive after proving; end the process explicitly.
process.exit();
