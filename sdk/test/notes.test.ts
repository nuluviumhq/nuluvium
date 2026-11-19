import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommitment, type Secret } from "@0xbow/privacy-pools-core-sdk";
import { cidDigestHex } from "../src/asp.ts";
import { freshAccount, isValidMnemonic, keysFromMnemonic, newMnemonic } from "../src/keys.ts";
import { changeSecrets, depositSecrets, noteAfterWithdrawal, type Note } from "../src/notes.ts";

// Public test mnemonic (BIP-39 test vector), never used for real funds.
const keys = keysFromMnemonic("test test test test test test test test test test test junk");
const SCOPE = 20883339666151915200592145183006062909365231028523521475069391119255857699183n;

function depositNote(index: bigint, value: bigint, label: bigint): Note {
  const secrets = depositSecrets(keys, SCOPE, index);
  return {
    depositIndex: index,
    label,
    value,
    nullifier: secrets.nullifier,
    secret: secrets.secret,
    commitment: getCommitment(value, label, secrets.nullifier as Secret, secrets.secret as Secret).hash,
    withdrawals: 0,
    depositTx: "0x00",
    depositor: "0x0000000000000000000000000000000000000001",
  };
}

test("change notes chain: value goes down, secrets come from (label, k), commitment matches", () => {
  const note = depositNote(0n, 50_000_000n, 12345n);
  const first = noteAfterWithdrawal(keys, note, 12_000_000n);
  const second = noteAfterWithdrawal(keys, first, 8_000_000n);

  assert.equal(first.value, 38_000_000n);
  assert.equal(second.value, 30_000_000n);
  assert.equal(second.withdrawals, 2);
  assert.equal(first.nullifier, changeSecrets(keys, 12345n, 0).nullifier);
  assert.equal(second.nullifier, changeSecrets(keys, 12345n, 1).nullifier);
  assert.equal(
    second.commitment,
    getCommitment(30_000_000n, 12345n, second.nullifier as Secret, second.secret as Secret).hash,
  );
  assert.notEqual(first.nullifier, note.nullifier);
});

test("withdrawal amount must be positive and at most the note value", () => {
  const note = depositNote(1n, 10_000_000n, 7n);
  assert.throws(() => noteAfterWithdrawal(keys, note, 0n), /out of range/);
  assert.throws(() => noteAfterWithdrawal(keys, note, 10_000_001n), /out of range/);
  assert.equal(noteAfterWithdrawal(keys, note, 10_000_000n).value, 0n);
});

test("fresh addresses are deterministic and distinct per deposit and piece", () => {
  const a = freshAccount(keys, 0n, 0).address;
  assert.equal(freshAccount(keys, 0n, 0).address, a);
  const all = new Set([a, freshAccount(keys, 0n, 1).address, freshAccount(keys, 1n, 0).address, freshAccount(keys, 1n, 1).address]);
  assert.equal(all.size, 4);
  // Not the user's normal wallet address (account 0).
  assert.notEqual(a, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
});

test("keys need a 12 or 24 word mnemonic", () => {
  assert.throws(() => keysFromMnemonic("too short"), /12 or 24 words/);
});

test("CID digest: reference vector", () => {
  // Raw CIDv1 of "hello world" (sha2-256 b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9).
  assert.equal(
    cidDigestHex("bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e"),
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
  assert.throws(() => cidDigestHex("Qm123"), /not a raw CIDv1/);
});

test("recovery phrases: new ones are valid 12-word phrases, typos are caught", () => {
  const phrase = newMnemonic();
  assert.equal(phrase.split(" ").length, 12);
  assert.ok(isValidMnemonic(phrase));
  assert.ok(isValidMnemonic(`  ${phrase.toUpperCase()}  `));
  assert.notEqual(newMnemonic(), phrase);
  assert.ok(!isValidMnemonic("test test test"));
  assert.ok(!isValidMnemonic("test test test test test test test test test test test test"));
});
