// Ways out.
//   ragequit  the depositing wallet takes a note's USDG back from the pool. Public: it links that
//             deposit to the wallet, so it is the exit for deposits that are not approved, or for
//             anyone who wants their USDG back as it was.
//   sell      a fresh address sells stock tokens for USDG through the Router, gasless: it signs an
//             order and a permit, the relayer sends Router.swap and takes its fee from the USDG.

import type { PrivacyPoolSDK, Secret } from "@0xbow/privacy-pools-core-sdk";
import { parseAbi, type Address, type ContractFunctionArgs, type HDAccount, type Hex, type PublicClient, type WalletClient } from "viem";
import type { NetworkConfig } from "./config.ts";
import type { Note } from "./notes.ts";
import { quotedSellMinimum } from "./quote.ts";
import { getQuote, sendSell, signOrder, signPermit, type Order, type Quote } from "./relayer.ts";
import { randomNonce } from "./routing.ts";

// JSON form: abitype cannot type the nested fixed array (uint256[2][2]) from the human-readable form.
export const ragequitAbi = [
  {
    type: "function",
    name: "ragequit",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_proof",
        type: "tuple",
        components: [
          { name: "pA", type: "uint256[2]" },
          { name: "pB", type: "uint256[2][2]" },
          { name: "pC", type: "uint256[2]" },
          { name: "pubSignals", type: "uint256[4]" },
        ],
      },
    ],
    outputs: [],
  },
  ...parseAbi(["error OnlyOriginalDepositor()", "error InvalidProof()", "error InvalidCommitment()", "error NullifierAlreadySpent()"]),
] as const;

export interface RagequitProof {
  pA: readonly [bigint, bigint];
  pB: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  pC: readonly [bigint, bigint];
  pubSignals: readonly [bigint, bigint, bigint, bigint];
}

/** Proves the note's commitment (the "commitment" circuit) in the pool's argument format. */
export async function proveRagequit(prover: PrivacyPoolSDK, note: Note): Promise<RagequitProof> {
  const { proof, publicSignals } = await prover.proveCommitment(note.value, note.label, note.nullifier as Secret, note.secret as Secret);
  const big = (value: unknown) => BigInt(String(value));
  if (publicSignals.length !== 4) throw new Error("unexpected commitment proof shape");
  return {
    pA: [big(proof.pi_a[0]), big(proof.pi_a[1])],
    // pB coordinates swapped, as the Groth16 verifier expects (same as formatProof).
    pB: [
      [big(proof.pi_b[0]![1]), big(proof.pi_b[0]![0])],
      [big(proof.pi_b[1]![1]), big(proof.pi_b[1]![0])],
    ],
    pC: [big(proof.pi_c[0]), big(proof.pi_c[1])],
    pubSignals: [big(publicSignals[0]), big(publicSignals[1]), big(publicSignals[2]), big(publicSignals[3])],
  };
}

/**
 * Takes the whole note back to the wallet that deposited it. The wallet sends the transaction and
 * pays the gas; the pool refuses any other sender.
 */
export async function ragequitNote(
  client: PublicClient,
  wallet: WalletClient,
  config: NetworkConfig,
  prover: PrivacyPoolSDK,
  note: Note,
): Promise<{ tx: Hex; value: bigint }> {
  const account = wallet.account;
  if (!account) throw new Error("wallet client needs an account");
  if (account.address.toLowerCase() !== note.depositor.toLowerCase()) {
    throw new Error("only the wallet that made this deposit can take it back");
  }
  if (note.value === 0n || note.ragequitTx) throw new Error("this deposit has nothing left to take back");

  const proof = await proveRagequit(prover, note);
  // Simulate first, so a bad proof or a spent note fails before the wallet is asked to sign.
  // Typed through ContractFunctionArgs: viem's `const args` inference fails on an interface value.
  const args: ContractFunctionArgs<typeof ragequitAbi, "nonpayable", "ragequit"> = [proof];
  const { request } = await client.simulateContract({ account, address: config.pool, abi: ragequitAbi, functionName: "ragequit", args });
  const tx = await wallet.writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error(`ragequit reverted: ${tx}`);
  return { tx, value: note.value };
}

const SELL_DEADLINE_SECONDS = 15 * 60;

/**
 * Sells `amountIn` of `token` held by a fresh address for USDG, which stays on that address.
 * @param minUsdgOut smallest USDG the owner accepts after the relayer and protocol fees
 */
export async function sellFromFresh(
  client: PublicClient,
  config: NetworkConfig,
  fresh: HDAccount,
  token: Address,
  amountIn: bigint,
  minUsdgOut: bigint,
): Promise<{ tx: Hex; fee: bigint }> {
  if (amountIn <= 0n) throw new Error("nothing to sell");
  return signAndSendSell(client, config, fresh, token, amountIn, minUsdgOut, await getQuote(config, client));
}

/**
 * Sells `amountIn` of `token` at a fresh Uniswap quote less `slippageBps` (and less room for the
 * relayer and protocol fees). Refuses when the holding is worth less than those fees.
 */
export async function sellAtQuote(
  client: PublicClient,
  config: NetworkConfig,
  fresh: HDAccount,
  token: Address,
  amountIn: bigint,
  slippageBps: number,
): Promise<{ tx: Hex; fee: bigint; quoted: bigint }> {
  if (amountIn <= 0n) throw new Error("nothing to sell");
  const quote = await getQuote(config, client);
  const { quoted, minimum } = await quotedSellMinimum(client, config, token, amountIn, quote.fee, slippageBps);
  if (minimum <= 0n) throw new Error("holding is worth less than the relayer and protocol fees");
  return { ...(await signAndSendSell(client, config, fresh, token, amountIn, minimum, quote)), quoted };
}

async function signAndSendSell(
  client: PublicClient,
  config: NetworkConfig,
  fresh: HDAccount,
  token: Address,
  amountIn: bigint,
  minUsdgOut: bigint,
  quote: Quote,
): Promise<{ tx: Hex; fee: bigint }> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + SELL_DEADLINE_SECONDS);
  const order: Order = {
    owner: fresh.address,
    tokenIn: token,
    tokenOut: config.usdg,
    amountIn,
    minAmountOut: minUsdgOut,
    maxFee: quote.fee * 2n, // room for the quote to move before the relayer sends
    nonce: randomNonce(),
    deadline,
  };
  const [orderSignature, permit] = await Promise.all([
    signOrder(fresh, config, order),
    signPermit(fresh, client, config, token, config.router, amountIn, deadline),
  ]);
  const sent = await sendSell(config, quote, { order, orderSignature, permit });
  return { tx: sent.tx, fee: sent.fee };
}
