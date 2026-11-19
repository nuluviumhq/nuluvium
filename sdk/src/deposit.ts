// Deposits USDG into the shielded pool under the next unused deposit index of these keys.

import { hashPrecommitment } from "@0xbow/privacy-pools-core-sdk";
import { parseEventLogs, type PublicClient, type WalletClient } from "viem";
import { entrypointAbi, erc20Abi, poolAbi } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";
import type { UserKeys } from "./keys.ts";
import { depositSecrets, recoverNotes, type Note } from "./notes.ts";

export async function depositUsdg(
  client: PublicClient,
  wallet: WalletClient,
  config: NetworkConfig,
  keys: UserKeys,
  amount: bigint,
): Promise<{ note: Note; tx: `0x${string}` }> {
  const account = wallet.account;
  if (!account) throw new Error("wallet client needs an account");

  const { spendable, spent } = await recoverNotes(client, config, keys);
  const used = [...spendable, ...spent].map((note) => note.depositIndex);
  const index = used.length === 0 ? 0n : used.reduce((max, value) => (value > max ? value : max)) + 1n;
  const secrets = depositSecrets(keys, config.scope, index);

  const send = async (request: Parameters<WalletClient["writeContract"]>[0]) => {
    const hash = await wallet.writeContract(request);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
    return receipt;
  };
  await send({ account, chain: wallet.chain, address: config.usdg, abi: erc20Abi, functionName: "approve", args: [config.entrypoint, amount] });
  const receipt = await send({
    account,
    chain: wallet.chain,
    address: config.entrypoint,
    abi: entrypointAbi,
    functionName: "deposit",
    args: [config.usdg, amount, hashPrecommitment(secrets.nullifier, secrets.secret)],
  });

  const [event] = parseEventLogs({ abi: poolAbi, eventName: "Deposited", logs: receipt.logs });
  if (!event) throw new Error("no Deposited event in the receipt");
  return {
    tx: receipt.transactionHash,
    note: {
      depositIndex: index,
      label: event.args._label,
      value: event.args._value,
      nullifier: secrets.nullifier,
      secret: secrets.secret,
      commitment: event.args._commitment,
      withdrawals: 0,
      depositTx: receipt.transactionHash,
      depositor: account.address,
    },
  };
}
