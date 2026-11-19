// Which notes can pay for an order. A note pays only once the approved-set provider (ASP) has put
// its deposit label in the approved set: before that, the withdrawal proof for a piece is refused.
// Right after `deposit` the new note is "waiting" for about a minute.

import type { Note } from "../../sdk/src/index.ts";

export type Approval = "approved" | "waiting" | "rejected";

export interface ApprovalSet {
  labels: bigint[];
  rejected: Array<{ label: string; reason: string }>;
}

export interface NoteApproval {
  approval: Approval;
  /** The ASP's reason, for a rejected note. */
  reason?: string;
}

export function noteApproval(note: Pick<Note, "label">, set: ApprovalSet): NoteApproval {
  if (set.labels.includes(note.label)) return { approval: "approved" };
  const rejected = set.rejected.find((item) => BigInt(item.label) === note.label);
  return rejected ? { approval: "rejected", reason: rejected.reason } : { approval: "waiting" };
}

/**
 * The note an order of `amount` pays from: the smallest approved, free note that covers it (bigger
 * notes stay for bigger orders). Otherwise a message telling the agent why none fits.
 */
export function pickNote<N extends Pick<Note, "label" | "value" | "depositIndex">>(
  notes: N[],
  set: ApprovalSet,
  busy: Set<string>,
  amount: bigint,
): { note: N } | { problem: string } {
  const covering = notes.filter((note) => note.value >= amount && !busy.has(note.depositIndex.toString()));
  const approved = covering.filter((note) => noteApproval(note, set).approval === "approved");
  const note = approved.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0))[0];
  if (note) return { note };
  if (covering.some((item) => noteApproval(item, set).approval === "waiting")) {
    return { problem: "The note that covers this order is still waiting for the clean-funds check (usually about a minute after the deposit). Try again shortly; get_balance shows each note's status." };
  }
  return { problem: "No free, approved note covers this amount. Use get_balance to see the notes; one order is paid from one note." };
}
