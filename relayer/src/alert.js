// Gas float alert. A cron reads the relayer's ETH balance; when it is below the alert line, a
// Telegram message goes to the operator (at most once per ALERT_EVERY_HOURS). The message holds
// only the relayer's own address and balance, never anything about pieces or users. Pure parts
// here; sending is in worker.js.

/** ETH with 6 decimals, from wei. */
export function formatEth(wei) {
  const micro = wei / 10n ** 12n;
  return `${micro / 1_000_000n}.${(micro % 1_000_000n).toString().padStart(6, "0")}`;
}

/**
 * @param {{ name: string, address: string, balance: bigint, alertBelow: bigint, refuseBelow: bigint, gasPerPiece: bigint, gasPrice: bigint }} input
 * @returns {string | null} the alert text, or null when the float is fine
 */
export function floatAlert({ name, address, balance, alertBelow, refuseBelow, gasPerPiece, gasPrice }) {
  if (balance >= alertBelow) return null;
  const perPiece = gasPerPiece * (gasPrice > 0n ? gasPrice : 1n);
  const piecesLeft = balance > refuseBelow ? (balance - refuseBelow) / perPiece : 0n;
  const state = balance < refuseBelow ? "It is refusing pieces now." : `About ${piecesLeft} more pieces before it refuses them.`;
  return `Nuluvium ${name} (${address}): gas float ${formatEth(balance)} ETH, below the alert line of ${formatEth(alertBelow)} ETH. ${state} Top it up.`;
}

/** True when no alert was sent in the last `everyHours` hours. */
export function alertDue(lastSentMs, nowMs, everyHours) {
  return lastSentMs === undefined || nowMs - lastSentMs >= everyHours * 3_600_000;
}
