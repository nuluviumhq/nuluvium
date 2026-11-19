import assert from "node:assert/strict";
import { test } from "node:test";
import { noteApproval, pickNote, type ApprovalSet } from "../src/approval.ts";

const note = (depositIndex: bigint, label: bigint, value: bigint) => ({ depositIndex, label, value });
const set: ApprovalSet = { labels: [10n, 20n], rejected: [{ label: "30", reason: "deposit above the per-deposit cap" }] };

test("a note is approved, rejected with the ASP's reason, or waiting", () => {
  assert.deepEqual(noteApproval({ label: 10n }, set), { approval: "approved" });
  assert.deepEqual(noteApproval({ label: 30n }, set), { approval: "rejected", reason: "deposit above the per-deposit cap" });
  assert.deepEqual(noteApproval({ label: 40n }, set), { approval: "waiting" });
});

test("an order pays from the smallest approved free note that covers it", () => {
  const notes = [note(0n, 10n, 50n), note(1n, 20n, 8n), note(2n, 40n, 6n)];
  const picked = pickNote(notes, set, new Set(), 5n);
  assert.ok("note" in picked);
  assert.equal(picked.note.depositIndex, 1n); // note 2 is smaller but still waiting
});

test("busy notes are skipped", () => {
  const picked = pickNote([note(0n, 10n, 50n), note(1n, 20n, 8n)], set, new Set(["1"]), 5n);
  assert.ok("note" in picked);
  assert.equal(picked.note.depositIndex, 0n);
});

test("when only a waiting note covers the order, the agent is told to wait", () => {
  const picked = pickNote([note(0n, 10n, 2n), note(1n, 40n, 9n)], set, new Set(), 5n);
  assert.ok("problem" in picked);
  assert.match(picked.problem, /still waiting for the clean-funds check/);
});

test("rejected or too small notes give the general message", () => {
  const picked = pickNote([note(0n, 30n, 100n), note(1n, 10n, 2n)], set, new Set(), 5n);
  assert.ok("problem" in picked);
  assert.match(picked.problem, /No free, approved note covers this amount/);
});
