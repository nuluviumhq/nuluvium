// Screening rules of the Nuluvium approved-set provider (ASP). Pure functions, no network access,
// so every decision can be replayed and tested.
//
// A deposit is approved when its depositor is not sanctioned (OFAC), not blocked by the stock token
// issuer, not on our own denylist, its USDG did not come from such an address (one hop back, see
// screenSources), and the deposit fits the beta caps. Approved deposits form the
// approved set; a withdrawal must prove its deposit is in that set. A deposit left out can only be
// ragequit back to the wallet that made it.

import { LeanIMT } from "@zk-kit/lean-imt";
import { poseidon2 } from "poseidon-lite";

export const REASONS = Object.freeze({
  SANCTIONED: "depositor on the OFAC sanctions list",
  ISSUER_BLOCKED: "depositor blocked by the stock token issuer",
  DENYLISTED: "depositor on the Nuluvium denylist",
  SOURCE_SANCTIONED: "funds came from an address on the OFAC sanctions list",
  SOURCE_ISSUER_BLOCKED: "funds came from an address blocked by the stock token issuer",
  SOURCE_DENYLISTED: "funds came from an address on the Nuluvium denylist",
  OVER_DEPOSIT_CAP: "deposit above the per-deposit cap",
  OVER_TOTAL_CAP: "approved total would exceed the total cap",
});

const lower = (address) => address.toLowerCase();

/** Default share of a deposit that flagged senders must reach to reject it: 10% (in basis points). */
export const SOURCE_SHARE_BPS = 1000n;

/**
 * Source-of-funds check, one hop back: the USDG transfers the depositor received up to the deposit
 * block (the most recent ones, as traced by the Worker). If flagged senders sent at least
 * `shareBps` of the deposit's value, the deposit is rejected. Below that share it passes, so a
 * flagged address cannot get someone's deposit refused by sending them dust.
 * Not covered: funds that passed through a clean address first (two or more hops).
 *
 * @param {{value: bigint, sources: {transfers: Array<{from: string, value: bigint}>}}} deposit
 * @returns {string|null} a REASONS value, or null when the sources pass
 */
export function screenSources(deposit, rules) {
  const shareBps = rules.sourceShareBps ?? SOURCE_SHARE_BPS;
  const checks = [
    [rules.sanctioned, REASONS.SOURCE_SANCTIONED],
    [rules.issuerBlocked, REASONS.SOURCE_ISSUER_BLOCKED],
    [rules.denylist, REASONS.SOURCE_DENYLISTED],
  ];
  for (const [list, reason] of checks) {
    let flagged = 0n;
    for (const transfer of deposit.sources.transfers) if (list.has(lower(transfer.from))) flagged += transfer.value;
    if (flagged > 0n && flagged * 10_000n >= deposit.value * shareBps) return reason;
  }
  return null;
}

/**
 * Decides which deposits enter the approved set.
 *
 * A deposit whose sources are not traced yet (`sources` null) waits, and so does every deposit
 * after it in chain order: approving later ones first could take room under the total cap that
 * belongs to the earlier deposit. The Worker posts no root while any deposit waits.
 *
 * @param {Array<{label: bigint, depositor: string, value: bigint, blockNumber: bigint, logIndex: number, sources?: {transfers: Array<{from: string, value: bigint}>} | null}>} deposits
 * @param {{
 *   sanctioned: Set<string>,       // lower-case addresses
 *   denylist: Set<string>,         // lower-case addresses
 *   issuerBlocked: Set<string>,    // lower-case addresses the issuer registry reports as blocked
 *   perDepositCap: bigint,         // in token units (USDG has 6 decimals)
 *   totalCap: bigint,
 *   checkSources?: boolean,        // default true; false skips the source check (and never waits)
 *   sourceShareBps?: bigint,       // default SOURCE_SHARE_BPS
 * }} rules
 * @returns {{approved: typeof deposits, rejected: Array<{deposit: object, reason: string}>, waiting: typeof deposits, approvedTotal: bigint}}
 */
export function screenDeposits(deposits, rules) {
  // Chain order decides who fits under the total cap: first come, first approved.
  const ordered = [...deposits].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );

  const approved = [];
  const rejected = [];
  const waiting = [];
  let approvedTotal = 0n;
  const checkSources = rules.checkSources ?? true;

  for (const deposit of ordered) {
    if (waiting.length > 0 || (checkSources && !deposit.sources)) {
      waiting.push(deposit);
      continue;
    }
    const depositor = lower(deposit.depositor);
    let reason = null;

    if (rules.sanctioned.has(depositor)) reason = REASONS.SANCTIONED;
    else if (rules.issuerBlocked.has(depositor)) reason = REASONS.ISSUER_BLOCKED;
    else if (rules.denylist.has(depositor)) reason = REASONS.DENYLISTED;
    if (!reason && checkSources) reason = screenSources(deposit, rules);
    if (!reason && deposit.value > rules.perDepositCap) reason = REASONS.OVER_DEPOSIT_CAP;
    else if (!reason && approvedTotal + deposit.value > rules.totalCap) reason = REASONS.OVER_TOTAL_CAP;

    if (reason) {
      rejected.push({ deposit, reason });
    } else {
      approved.push(deposit);
      approvedTotal += deposit.value;
    }
  }

  return { approved, rejected, waiting, approvedTotal };
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
