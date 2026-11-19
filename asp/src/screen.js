// Screening rules of the Nuluvium approved-set provider (ASP). Pure functions, no network access,
// so every decision can be replayed and tested.
//
// A deposit is approved when its depositor is not sanctioned (OFAC), not blocked by the stock token
// issuer, not on our own denylist, and the deposit fits the beta caps. Approved deposits form the
// approved set; a withdrawal must prove its deposit is in that set. A deposit left out can only be
// ragequit back to the wallet that made it.

import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";

export const REASONS = Object.freeze({
  SANCTIONED: "depositor on the OFAC sanctions list",
  ISSUER_BLOCKED: "depositor blocked by the stock token issuer",
  DENYLISTED: "depositor on the Nuluvium denylist",
  OVER_DEPOSIT_CAP: "deposit above the per-deposit cap",
  OVER_TOTAL_CAP: "approved total would exceed the total cap",
});

const lower = (address) => address.toLowerCase();

/**
 * Decides which deposits enter the approved set.
 *
 * @param {Array<{label: bigint, depositor: string, value: bigint, blockNumber: bigint, logIndex: number}>} deposits
 * @param {{
 *   sanctioned: Set<string>,       // lower-case addresses
 *   denylist: Set<string>,         // lower-case addresses
 *   issuerBlocked: Set<string>,    // lower-case addresses the issuer registry reports as blocked
 *   perDepositCap: bigint,         // in token units (USDG has 6 decimals)
 *   totalCap: bigint,
 * }} rules
 * @returns {{approved: typeof deposits, rejected: Array<{deposit: object, reason: string}>, approvedTotal: bigint}}
 */
export function screenDeposits(deposits, rules) {
  // Chain order decides who fits under the total cap: first come, first approved.
  const ordered = [...deposits].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );

  const approved = [];
  const rejected = [];
  let approvedTotal = 0n;

  for (const deposit of ordered) {
    const depositor = lower(deposit.depositor);
    let reason = null;

    if (rules.sanctioned.has(depositor)) reason = REASONS.SANCTIONED;
    else if (rules.issuerBlocked.has(depositor)) reason = REASONS.ISSUER_BLOCKED;
    else if (rules.denylist.has(depositor)) reason = REASONS.DENYLISTED;
    else if (deposit.value > rules.perDepositCap) reason = REASONS.OVER_DEPOSIT_CAP;
    else if (approvedTotal + deposit.value > rules.totalCap) reason = REASONS.OVER_TOTAL_CAP;

    if (reason) {
      rejected.push({ deposit, reason });
    } else {
      approved.push(deposit);
      approvedTotal += deposit.value;
    }
  }

  return { approved, rejected, approvedTotal };
}

/**
 * Root of the approved set: a lean incremental Merkle tree of labels with Poseidon(2), the same
 * tree the Privacy Pools circuits and SDK use. One label gives a root equal to that label.
 * @param {bigint[]} labels in approval order
 */
export function approvedRoot(labels) {
  if (labels.length === 0) return 0n;
  const tree = new LeanIMT((a, b) => poseidon2([a, b]));
  tree.insertMany(labels);
  return tree.root;
}
