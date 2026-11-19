// Spendable notes, rebuilt from the chain and the user's keys alone (nothing secret is stored).
//
// Deposit i uses secrets derived from (scope, i); its precommitment hash appears in the Deposited
// event, which is how our deposits are found. Each private withdrawal spends a note and creates a
// "change" note with secrets derived from (label, k) for the k-th withdrawal of that deposit. The
// Withdrawn event names the spent nullifier hash and the amount, so the chain can be followed.

import {
  generateDepositSecrets,
  generateWithdrawalSecrets,
  getCommitment,
  hashPrecommitment,
  type Hash,
} from "@0xbow/privacy-pools-core-sdk";
import { poseidon1 } from "poseidon-lite";
import type { Address, Hex, PublicClient } from "viem";
import { poolLogs } from "./chain.ts";
import type { NetworkConfig } from "./config.ts";
import type { UserKeys } from "./keys.ts";

export interface Note {
  /** Index of the deposit this note descends from (also picks its fresh addresses). */
  depositIndex: bigint;
  label: bigint;
  /** Current value in token units. */
  value: bigint;
  nullifier: bigint;
  secret: bigint;
  /** Commitment hash of the current note (a leaf in the pool's state tree). */
  commitment: bigint;
  /** Private withdrawals already made from this deposit; the next one is number `withdrawals`. */
  withdrawals: number;
  depositTx: `0x${string}`;
  /** Wallet that made the deposit: the only address that can ragequit it. */
  depositor: Address;
  /** Set when the deposit was taken back with a ragequit (the note is then spent). */
  ragequitTx?: Hex;
}

/** Hash the pool records when a note is spent (Poseidon of the nullifier, as in the circuit). */
export const nullifierHash = (nullifier: bigint): bigint => poseidon1([nullifier]);

/** Secrets of deposit number `index` for this pool. */
export function depositSecrets(keys: UserKeys, scope: bigint, index: bigint) {
  return generateDepositSecrets(keys.masterKeys, scope as Hash, index);
}

/** Secrets of the change note created by withdrawal number `k` from deposit `label`. */
export function changeSecrets(keys: UserKeys, label: bigint, k: number) {
  return generateWithdrawalSecrets(keys.masterKeys, label as Hash, BigInt(k));
}

/** The note left after withdrawing `amount` from `note` (the next change note). */
export function noteAfterWithdrawal(keys: UserKeys, note: Note, amount: bigint): Note {
  if (amount <= 0n || amount > note.value) throw new Error("withdrawal amount out of range");
  const next = changeSecrets(keys, note.label, note.withdrawals);
  const value = note.value - amount;
  return {
    ...note,
    value,
    nullifier: next.nullifier,
    secret: next.secret,
    commitment: getCommitment(value, note.label, next.nullifier, next.secret).hash,
    withdrawals: note.withdrawals + 1,
  };
}

/**
 * Finds every deposit made with these keys and follows its withdrawals to the current note.
 * @param gapLimit how many unused deposit indexes in a row end the search
 */
export async function recoverNotes(
  client: PublicClient,
  config: NetworkConfig,
  keys: UserKeys,
  { gapLimit = 10 }: { gapLimit?: number } = {},
): Promise<{ spendable: Note[]; spent: Note[] }> {
  // One scan for all three event types.
  const logs = await poolLogs(client, config, ["Deposited", "Withdrawn", "Ragequit"]);
  const deposits = logs.filter((log) => log.eventName === "Deposited");
  const withdrawals = logs.filter((log) => log.eventName === "Withdrawn");
  const ragequits = logs.filter((log) => log.eventName === "Ragequit");
  const depositByPrecommitment = new Map(deposits.map((log) => [log.args._precommitmentHash as bigint, log]));
  const withdrawalBySpentNullifier = new Map(withdrawals.map((log) => [log.args._spentNullifier as bigint, log]));
  const ragequitByCommitment = new Map(ragequits.map((log) => [log.args._commitment as bigint, log]));

  const spendable: Note[] = [];
  const spent: Note[] = [];
  let misses = 0;
  for (let index = 0n; misses < gapLimit; index++) {
    const secrets = depositSecrets(keys, config.scope, index);
    const log = depositByPrecommitment.get(hashPrecommitment(secrets.nullifier, secrets.secret));
    if (!log) {
      misses += 1;
      continue;
    }
    misses = 0;

    let note: Note = {
      depositIndex: index,
      label: log.args._label as bigint,
      value: log.args._value as bigint,
      nullifier: secrets.nullifier,
      secret: secrets.secret,
      commitment: log.args._commitment as bigint,
      withdrawals: 0,
      depositTx: log.transactionHash,
      depositor: log.args._depositor as Address,
    };
    // Follow the chain of withdrawals: each one spends the current note and creates the change.
    for (;;) {
      const withdrawal = withdrawalBySpentNullifier.get(nullifierHash(note.nullifier));
      if (!withdrawal) break;
      const next = noteAfterWithdrawal(keys, note, withdrawal.args._value as bigint);
      if (next.commitment !== withdrawal.args._newCommitment) {
        throw new Error(`Note chain of deposit ${index} does not match the chain (withdrawal ${note.withdrawals})`);
      }
      note = next;
    }

    // A ragequit spends the current note (the deposit itself or a change note left after private
    // withdrawals) and ends the chain: the pool names the commitment it took back.
    const ragequit = ragequitByCommitment.get(note.commitment);
    if (ragequit) note = { ...note, ragequitTx: ragequit.transactionHash };
    (note.value > 0n && !ragequit ? spendable : spent).push(note);
  }
  return { spendable, spent };
}
