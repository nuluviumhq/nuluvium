// Session 1.8b check: deposits tUSDG under the Nuluvium keys of a PUBLIC test wallet (the BIP-39
// test mnemonic "test test … junk", account 0), derived exactly as the web app does from a
// signature of keyMessage. The web app, unlocked with the same wallet, must then show that balance.
// Nothing secret here: anyone can derive this wallet and its signature. Testnet only.
// Usage (from testnet/): node web-login-check.ts [usdg]   default 10; prints the address and signature

import { createWalletClient, http, parseAbi } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { ROBINHOOD_TESTNET, chainFor, depositUsdg, keyMessage, keysFromSignature, publicClientFor, recoverNotes } from "../sdk/src/index.ts";
import { devVar, devVarOptional } from "./recover.ts";

const PUBLIC_TEST_MNEMONIC = "test test test test test test test test test test test junk";
const amount = BigInt(Math.round(Number(process.argv[2] ?? 10) * 1e6));

const testWallet = mnemonicToAccount(PUBLIC_TEST_MNEMONIC);
const signature = await testWallet.signMessage({ message: keyMessage(testWallet.address, ROBINHOOD_TESTNET.chainId) });
const keys = keysFromSignature(signature);
console.log(`Test wallet: ${testWallet.address}`);
console.log(`Key signature (public test wallet): ${signature}`);

const rpcUrl = devVarOptional("TESTNET_RPC_URL");
const config = rpcUrl ? { ...ROBINHOOD_TESTNET, rpcUrl, logChunk: 10_000n } : ROBINHOOD_TESTNET;
const client = publicClientFor(config);

if (amount > 0n) {
  // The deployer pays for the deposit; who deposits does not matter for the note keys.
  const payer = privateKeyToAccount(devVar("TESTNET_DEPLOYER_KEY") as `0x${string}`);
  const wallet = createWalletClient({ account: payer, chain: chainFor(config), transport: http(config.rpcUrl) });
  const mint = await wallet.writeContract({
    address: config.usdg,
    abi: parseAbi(["function mint(address to, uint256 amount)"]),
    functionName: "mint",
    args: [payer.address, amount],
  });
  await client.waitForTransactionReceipt({ hash: mint });
  const { tx } = await depositUsdg(client, wallet, config, keys, amount);
  console.log(`Deposited ${Number(amount) / 1e6} tUSDG under the test wallet's keys: https://explorer.testnet.chain.robinhood.com/tx/${tx}`);
}

const { spendable } = await recoverNotes(client, config, keys);
console.log(`Shielded balance of the test wallet: ${Number(spendable.reduce((sum, note) => sum + note.value, 0n)) / 1e6} tUSDG`);
setTimeout(() => process.exit(0), 100);
