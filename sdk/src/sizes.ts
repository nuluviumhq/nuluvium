// Deposit-size guidance. A deposit is public, and while few people use the pool an unusual amount
// (137.42) is easier to pick out than a common one (100). The app and the MCP server suggest common
// sizes and how to split an odd amount into them. Advice only: any amount still works.
// No dependencies, so the web app can import it without the rest of the SDK.

const UNIT = 1_000_000n; // USDG has 6 decimals

/** Common deposit sizes in whole USDG, largest first (the per-deposit cap is 1,000 until the audit). */
export const COMMON_DEPOSIT_SIZES: readonly bigint[] = [1000n, 500n, 250n, 100n, 50n, 25n, 10n].map((size) => size * UNIT);

export interface DepositSizeAdvice {
  /** True when the amount is one of the common sizes. */
  common: boolean;
  /** The amount as common sizes, largest first (one deposit each); empty below the smallest size. */
  split: bigint[];
  /** What the split leaves out (stays in the wallet). */
  rest: bigint;
}

/** Splits `amount` (USDG units) into common sizes, largest first. */
export function depositSizeAdvice(amount: bigint): DepositSizeAdvice {
  const common = COMMON_DEPOSIT_SIZES.includes(amount);
  const split: bigint[] = [];
  let rest = amount;
  for (const size of COMMON_DEPOSIT_SIZES) {
    while (rest >= size) {
      split.push(size);
      rest -= size;
    }
  }
  return { common, split, rest };
}
