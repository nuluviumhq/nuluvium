// The deposit tool's rules, kept apart from the server so they can be tested without a chain.
// A deposit is paid from the agent's own wallet (the mnemonic's account 0, see sdk depositAccount):
// it needs the USDG and a little ETH for two transactions (approve, then deposit).

/** Beta cap per deposit, the same as the approved-set provider applies (asp/src/screen.js). */
export const DEPOSIT_CAP = 1_000n * 1_000_000n;
/** Smallest deposit: one piece of the smallest order (1 USDG). */
export const MIN_DEPOSIT = 1_000_000n;
/** Gas reserve for approve + deposit on Robinhood Chain (an L2: well above the real cost). */
export const MIN_GAS_WEI = 10n ** 13n; // 0.00001 ETH

export interface WalletFunds {
  usdg: bigint;
  eth: bigint;
}

/** Why this deposit cannot go ahead, or null when it can. Messages are written for the agent. */
export function depositProblem(amount: bigint, funds: WalletFunds, wallet: string, faucet?: string): string | null {
  if (amount < MIN_DEPOSIT) return "The smallest deposit is 1 USDG.";
  if (amount > DEPOSIT_CAP) return "Deposits are capped at 1,000 USDG each until the audit; a larger one would not be approved.";
  if (funds.usdg < amount) {
    return `The deposit wallet ${wallet} holds ${formatUsdg(funds.usdg)} USDG, less than ${formatUsdg(amount)}. Send USDG to it first.`;
  }
  if (funds.eth < MIN_GAS_WEI) {
    return `The deposit wallet ${wallet} has no ETH for gas. Send it a little ETH first${faucet ? ` (testnet faucet: ${faucet})` : ""}.`;
  }
  return null;
}

/** USDG units (6 decimals) as a plain number string, trailing zeros dropped. */
export function formatUsdg(units: bigint): string {
  const whole = units / 1_000_000n;
  const fraction = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
