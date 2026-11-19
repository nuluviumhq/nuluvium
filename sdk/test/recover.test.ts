import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommitment, hashPrecommitment, type Secret } from "@0xbow/privacy-pools-core-sdk";
import type { PublicClient } from "viem";
import { ROBINHOOD_TESTNET } from "../src/config.ts";
import { keysFromMnemonic } from "../src/keys.ts";
import { depositSecrets, noteAfterWithdrawal, nullifierHash, recoverNotes, type Note } from "../src/notes.ts";

// Public test mnemonic (BIP-39 test vector), never used for real funds.
const keys = keysFromMnemonic("test test test test test test test test test test test junk");
const config = { ...ROBINHOOD_TESTNET, deployBlock: 0n, logChunk: 1_000n };
const DEPOSITOR = "0x00000000000000000000000000000000000000d1";

let logIndex = 0;
const log = (eventName: string, args: Record<string, unknown>, tx: string) => ({
  eventName,
  args,
  blockNumber: 1n,
  logIndex: logIndex++,
  transactionHash: tx,
});

function deposit(index: bigint, value: bigint, label: bigint) {
  const secrets = depositSecrets(keys, config.scope, index);
  const commitment = getCommitment(value, label, secrets.nullifier as Secret, secrets.secret as Secret).hash;
  const note: Note = {
    depositIndex: index,
    label,
    value,
    nullifier: secrets.nullifier,
    secret: secrets.secret,
    commitment,
    withdrawals: 0,
    depositTx: `0xd${index}`,
    depositor: DEPOSITOR,
  };
  const event = log(
    "Deposited",
    { _depositor: DEPOSITOR, _commitment: commitment, _label: label, _value: value, _precommitmentHash: hashPrecommitment(secrets.nullifier, secrets.secret) },
    note.depositTx,
  );
  return { note, event };
}

const withdrawn = (note: Note, amount: bigint) => {
  const next = noteAfterWithdrawal(keys, note, amount);
  return { next, event: log("Withdrawn", { _processooor: DEPOSITOR, _value: amount, _spentNullifier: nullifierHash(note.nullifier), _newCommitment: next.commitment }, "0xw") };
};
const ragequit = (note: Note, tx: string) => log("Ragequit", { _ragequitter: DEPOSITOR, _commitment: note.commitment, _label: note.label, _value: note.value }, tx);

/** Only what poolLogs uses: one chunk, every log at once. */
const fakeClient = (logs: unknown[]) => ({ getBlockNumber: async () => 10n, getLogs: async () => logs }) as unknown as PublicClient;

test("recoverNotes: a ragequit of the deposit or of a change note marks it spent", async () => {
  const kept = deposit(0n, 20_000_000n, 11n);
  const quitAtOnce = deposit(1n, 5_000_000n, 22n);
  const partly = deposit(2n, 30_000_000n, 33n);
  const piece = withdrawn(partly.note, 10_000_000n);

  const { spendable, spent } = await recoverNotes(
    fakeClient([kept.event, quitAtOnce.event, partly.event, piece.event, ragequit(quitAtOnce.note, "0xq1"), ragequit(piece.next, "0xq2")]),
    config,
    keys,
  );

  assert.deepEqual(spendable.map((note) => note.depositIndex), [0n]);
  assert.equal(spendable[0]!.depositor, DEPOSITOR);
  assert.deepEqual(spent.map((note) => [note.depositIndex, note.ragequitTx, note.value]), [
    [1n, "0xq1", 5_000_000n],
    [2n, "0xq2", 20_000_000n],
  ]);
});
