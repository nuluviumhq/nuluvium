// What one new order can spend, and why it cannot go out yet. Mirrors placeOrder (session.tsx): an
// order pays from one approved deposit that no open order uses, and every piece is at least
// MIN_PIECE. Pure, so each case can be tested.

export interface LimitNote {
  depositIndex: bigint;
  value: bigint;
  approval: "approved" | "waiting" | "rejected";
}

export interface LimitOrder {
  id: string;
  depositIndex: string;
}

/** Why Route order is disabled: too small for the pieces, no balance, deposits busy, waiting, none approved, or above the largest free deposit. */
export type Blocker = "small" | "empty" | "busy" | "waiting" | "none" | "short";

export function orderLimits(input: {
  /** Undefined until the balance has been read once. */
  notes: LimitNote[] | undefined;
  openOrders: LimitOrder[];
  amount: bigint;
  minAmount: bigint;
}): { maxSpend: bigint | undefined; blocker: Blocker | null; busyOrderId?: string } {
  const { notes, openOrders, amount, minAmount } = input;
  if (!notes) return { maxSpend: undefined, blocker: null };
  const busy = new Set(openOrders.map((order) => order.depositIndex));
  const approved = notes.filter((note) => note.approval === "approved" && note.value > 0n);
  const free = approved.filter((note) => !busy.has(note.depositIndex.toString()));
  const maxSpend = free.reduce((largest, note) => (note.value > largest ? note.value : largest), 0n);
  const busyOrderId = openOrders.find((order) => approved.some((note) => note.depositIndex.toString() === order.depositIndex))?.id;
  if (amount <= 0n || amount <= maxSpend) return { maxSpend, blocker: amount > 0n && amount < minAmount ? "small" : null, busyOrderId };
  if (amount < minAmount) return { maxSpend, blocker: "small", busyOrderId };
  const approvedTotal = approved.reduce((sum, note) => sum + note.value, 0n);
  const blocker: Blocker = notes.every((note) => note.value === 0n)
    ? "empty"
    : maxSpend === 0n && approved.length > 0
      ? "busy"
      : notes.some((note) => note.approval === "waiting") && approvedTotal < amount
        ? "waiting"
        : maxSpend === 0n
          ? "none"
          : "short";
  return { maxSpend, blocker, busyOrderId };
}
