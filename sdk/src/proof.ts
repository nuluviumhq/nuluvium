// Withdrawal proofs with the Privacy Pools SDK. Browser-safe: the folder-based prover for Node
// lives in node.ts (`@nuluvium/sdk/node`).

import {
  Circuits,
  PrivacyPoolSDK,
  calculateContext,
  generateMerkleProof,
  getCommitment,
  type Hash,
  type Secret,
  type WithdrawalProof,
} from "@0xbow/privacy-pools-core-sdk";
import { encodeAbiParameters, type Address, type Hex } from "viem";
import type { NetworkConfig } from "./config.ts";
import { changeSecrets, type Note } from "./notes.ts";
import type { UserKeys } from "./keys.ts";

/**
 * Prover that downloads the circuit files from `<baseUrl>/artifacts/` (browser or Node with fetch).
 * The SDK checks every file against its pinned SHA-256 hashes.
 */
export function createUrlProver(baseUrl: string): PrivacyPoolSDK {
  return new PrivacyPoolSDK(new Circuits({ baseUrl, browser: true }));
}

export interface WithdrawalTerms {
  recipient: Address;
  feeRecipient: Address;
  relayFeeBps: bigint;
}

/** Contract-ready proof: snarkjs output with pB coordinates swapped, as the SDK's contracts service does. */
export interface FormattedProof {
  pA: [string, string];
  pB: [[string, string], [string, string]];
  pC: [string, string];
  pubSignals: string[];
}

export function formatProof(proof: WithdrawalProof): FormattedProof {
  const p = proof.proof;
  return {
    pA: [String(p.pi_a[0]), String(p.pi_a[1])],
    pB: [
      [String(p.pi_b[0]![1]), String(p.pi_b[0]![0])],
      [String(p.pi_b[1]![1]), String(p.pi_b[1]![0])],
    ],
    pC: [String(p.pi_c[0]), String(p.pi_c[1])],
    pubSignals: proof.publicSignals.map(String),
  };
}

const leanTreeDepth = (size: number): bigint => (size <= 1 ? 0n : BigInt(Math.ceil(Math.log2(size))));

/**
 * Proves a withdrawal of `amount` from `note` under `terms`, against the given state leaves and
 * approved labels. Throws "Leaf not found" if the deposit is not in the approved set.
 */
export async function proveWithdrawal(
  prover: PrivacyPoolSDK,
  config: NetworkConfig,
  keys: UserKeys,
  note: Note,
  amount: bigint,
  terms: WithdrawalTerms,
  stateLeaves: bigint[],
  approvedLabels: bigint[],
): Promise<{ withdrawal: { processooor: Address; data: Hex }; proof: WithdrawalProof; seconds: number }> {
  const stateProof = generateMerkleProof(stateLeaves, note.commitment);
  const aspProof = generateMerkleProof(approvedLabels, note.label);
  const withdrawal = {
    processooor: config.entrypoint,
    data: encodeAbiParameters(
      [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint256" }] }],
      [[terms.recipient, terms.feeRecipient, terms.relayFeeBps]],
    ),
  };
  const change = changeSecrets(keys, note.label, note.withdrawals);
  const started = Date.now();
  const commitment = getCommitment(note.value, note.label, note.nullifier as Secret, note.secret as Secret);
  const proof = await prover.proveWithdrawal(commitment, {
    context: BigInt(calculateContext(withdrawal, config.scope as Hash)),
    withdrawalAmount: amount,
    stateMerkleProof: stateProof,
    aspMerkleProof: aspProof,
    stateRoot: stateProof.root as Hash,
    stateTreeDepth: leanTreeDepth(stateLeaves.length),
    aspRoot: aspProof.root as Hash,
    aspTreeDepth: leanTreeDepth(approvedLabels.length),
    newSecret: change.secret,
    newNullifier: change.nullifier,
  });
  if (!(await prover.verifyWithdrawal(proof))) throw new Error("withdrawal proof failed local verification");
  return { withdrawal, proof, seconds: (Date.now() - started) / 1000 };
}
