import assert from "node:assert/strict";
import { test } from "node:test";
import { rawCid } from "../src/cid.js";
import { REASONS, approvedRoot, screenDeposits, screenSources } from "../src/screen.js";

const USDG = 1_000_000n;
const rules = (overrides = {}) => ({
  sanctioned: new Set(),
  denylist: new Set(),
  issuerBlocked: new Set(),
  perDepositCap: 1_000n * USDG,
  totalCap: 25_000n * USDG,
  checkSources: false, // the source check has its own tests below
  ...overrides,
});
let nextBlock = 100n;
const deposit = (depositor, usdg, label) => ({
  label: BigInt(label),
  depositor,
  value: BigInt(usdg) * USDG,
  blockNumber: nextBlock++,
  logIndex: 0,
});

const ALICE = "0x00000000000000000000000000000000000A11CE";
const BOB = "0x0000000000000000000000000000000000000B0B";

test("approves a clean deposit under the caps", () => {
  const result = screenDeposits([deposit(ALICE, 25, 1)], rules());
  assert.equal(result.approved.length, 1);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.approvedTotal, 25n * USDG);
});

test("rejects sanctioned, issuer-blocked and denylisted depositors (case-insensitive)", () => {
  const deposits = [deposit(ALICE, 10, 1), deposit(BOB, 10, 2), deposit(ALICE.toUpperCase().replace("0X", "0x"), 10, 3)];
  const sanctionedResult = screenDeposits(deposits, rules({ sanctioned: new Set([ALICE.toLowerCase()]) }));
  assert.deepEqual(sanctionedResult.rejected.map((r) => r.reason), [REASONS.SANCTIONED, REASONS.SANCTIONED]);

  const blockedResult = screenDeposits([deposit(BOB, 10, 4)], rules({ issuerBlocked: new Set([BOB.toLowerCase()]) }));
  assert.equal(blockedResult.rejected[0].reason, REASONS.ISSUER_BLOCKED);

  const deniedResult = screenDeposits([deposit(BOB, 10, 5)], rules({ denylist: new Set([BOB.toLowerCase()]) }));
  assert.equal(deniedResult.rejected[0].reason, REASONS.DENYLISTED);
});

test("per-deposit cap: exactly the cap passes, one unit more does not", () => {
  const atCap = { ...deposit(ALICE, 1_000, 1) };
  const overCap = { ...deposit(ALICE, 1_000, 2), value: 1_000n * USDG + 1n };
  const result = screenDeposits([atCap, overCap], rules());
  assert.deepEqual(result.approved.map((d) => d.label), [1n]);
  assert.equal(result.rejected[0].reason, REASONS.OVER_DEPOSIT_CAP);
});

test("total cap is first come, first approved, in chain order", () => {
  const first = deposit(ALICE, 600, 1);
  const second = deposit(BOB, 600, 2);
  const third = deposit(ALICE, 300, 3);
  // Passed out of order on purpose: screening must sort by block and log index.
  const result = screenDeposits([third, second, first], rules({ totalCap: 1_000n * USDG }));
  assert.deepEqual(result.approved.map((d) => d.label), [1n, 3n]);
  assert.equal(result.rejected[0].deposit.label, 2n);
  assert.equal(result.rejected[0].reason, REASONS.OVER_TOTAL_CAP);
  assert.equal(result.approvedTotal, 900n * USDG);
});

test("rejected deposits do not count toward the total cap", () => {
  const bad = deposit(BOB, 900, 1);
  const good = deposit(ALICE, 900, 2);
  const result = screenDeposits([bad, good], rules({ totalCap: 1_000n * USDG, denylist: new Set([BOB.toLowerCase()]) }));
  assert.deepEqual(result.approved.map((d) => d.label), [2n]);
});

test("root matches Privacy Pools trees on Robinhood Chain testnet", () => {
  // One leaf: the root is the leaf. Value posted on chain by session 1.2 for its single label.
  const label = 16313245325821979075297386212513985904297897146991269808238750081968837274575n;
  assert.equal(approvedRoot([label]), label);

  // Two leaves: same lean tree and Poseidon as the pool's state tree. Leaves and root read from the
  // pool's LeafInserted events (deposit + change note of the 1.2 withdrawal).
  const leaves = [
    18402354873283152928355507651301499580489805487210388907742005634694330232580n,
    20148189093760410576141682007640553496464102743491881745031732273274224100092n,
  ];
  assert.equal(approvedRoot(leaves), 4502072459704943122205767710308751450541840596885252695599089292796881459210n);
  assert.equal(approvedRoot([]), 0n);
});

test("CID: known vector and length accepted by updateRoot (32 to 64)", async () => {
  // Raw CIDv1 of "hello world", as produced by `ipfs add --cid-version 1 --raw-leaves`.
  const cid = await rawCid(new TextEncoder().encode("hello world"));
  assert.equal(cid, "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e");
  assert.equal(cid.length, 59);
});

// Source of funds, one hop back.
const MIXER = "0x00000000000000000000000000000000000000AA";
const FAUCET = "0x00000000000000000000000000000000000000FA";
const traced = (item, transfers) => ({ ...item, sources: { transfers: transfers.map(([from, usdg]) => ({ from, value: BigInt(usdg) * USDG })) } });
const sourceRules = (overrides = {}) => rules({ checkSources: true, ...overrides });

test("rejects a deposit when at least 10% of it came from a sanctioned, issuer-blocked or denylisted sender", () => {
  const sanctioned = new Set([MIXER.toLowerCase()]);
  const result = screenDeposits([traced(deposit(ALICE, 100, 1), [[FAUCET, 90], [MIXER, 10]])], sourceRules({ sanctioned }));
  assert.equal(result.rejected[0].reason, REASONS.SOURCE_SANCTIONED);

  const blocked = screenDeposits([traced(deposit(ALICE, 100, 2), [[MIXER, 50]])], sourceRules({ issuerBlocked: new Set([MIXER.toLowerCase()]) }));
  assert.equal(blocked.rejected[0].reason, REASONS.SOURCE_ISSUER_BLOCKED);

  const denied = screenDeposits([traced(deposit(ALICE, 100, 3), [[MIXER.toUpperCase().replace("0X", "0x"), 100]])], sourceRules({ denylist: new Set([MIXER.toLowerCase()]) }));
  assert.equal(denied.rejected[0].reason, REASONS.SOURCE_DENYLISTED);
});

test("dust from a flagged sender (under 10% of the deposit) does not get a deposit refused", () => {
  const sanctioned = new Set([MIXER.toLowerCase()]);
  const result = screenDeposits([traced(deposit(ALICE, 100, 1), [[FAUCET, 100], [MIXER, 9]])], sourceRules({ sanctioned }));
  assert.equal(result.approved.length, 1);
  assert.equal(screenSources(traced(deposit(ALICE, 100, 2), [[MIXER, 9]]), { sanctioned, issuerBlocked: new Set(), denylist: new Set() }), null);
});

test("the depositor's own listing is reported before a source reason", () => {
  const sanctioned = new Set([ALICE.toLowerCase(), MIXER.toLowerCase()]);
  const result = screenDeposits([traced(deposit(ALICE, 100, 1), [[MIXER, 100]])], sourceRules({ sanctioned }));
  assert.equal(result.rejected[0].reason, REASONS.SANCTIONED);
});

test("an untraced deposit waits, and so does every later one (the total cap stays first come, first approved)", () => {
  const deposits = [traced(deposit(ALICE, 10, 1), []), { ...deposit(BOB, 10, 2), sources: null }, traced(deposit(ALICE, 10, 3), [[FAUCET, 10]])];
  const result = screenDeposits(deposits, sourceRules());
  assert.deepEqual(result.approved.map((item) => item.label), [1n]);
  assert.deepEqual(result.waiting.map((item) => item.label), [2n, 3n]);
  assert.equal(result.rejected.length, 0);
});

test("a deposit made from minted USDG (no flagged sender) passes", () => {
  const result = screenDeposits([traced(deposit(ALICE, 10, 1), [["0x0000000000000000000000000000000000000000", 10]])], sourceRules());
  assert.equal(result.approved.length, 1);
});
