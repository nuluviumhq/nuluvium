// Why the clean-funds check (the ASP) did not approve a deposit, in plain words with the next step.
// Codes as asp/src/screen.js REASONS publishes them; sets from before the codes carry only the text,
// so the code is looked up from it.

export type ReasonCode =
  | "SANCTIONED"
  | "ISSUER_BLOCKED"
  | "DENYLISTED"
  | "SOURCE_SANCTIONED"
  | "SOURCE_ISSUER_BLOCKED"
  | "SOURCE_DENYLISTED"
  | "OVER_DEPOSIT_CAP"
  | "OVER_TOTAL_CAP";

const CODE_BY_TEXT: Record<string, ReasonCode> = {
  "depositor on the OFAC sanctions list": "SANCTIONED",
  "depositor blocked by the stock token issuer": "ISSUER_BLOCKED",
  "depositor on the Nuluvium denylist": "DENYLISTED",
  "funds came from an address on the OFAC sanctions list": "SOURCE_SANCTIONED",
  "funds came from an address blocked by the stock token issuer": "SOURCE_ISSUER_BLOCKED",
  "funds came from an address on the Nuluvium denylist": "SOURCE_DENYLISTED",
  "deposit above the per-deposit cap": "OVER_DEPOSIT_CAP",
  "approved total would exceed the total cap": "OVER_TOTAL_CAP",
};

/** Short label (stats) and the depositor's explanation with what to do next (app). */
export const REASON_COPY: Record<ReasonCode, { label: string; explain: string }> = {
  OVER_DEPOSIT_CAP: { label: "Above the per-deposit cap", explain: "Above the 1,000 tUSDG cap per deposit. Take it back, then deposit 1,000 or less." },
  OVER_TOTAL_CAP: { label: "Beta total full", explain: "The beta total is full, so new deposits wait their turn. Take it back; nothing is lost." },
  SANCTIONED: { label: "Depositor on the OFAC list", explain: "The depositing wallet is on the OFAC sanctions list. It can only be taken back." },
  ISSUER_BLOCKED: { label: "Depositor blocked by the issuer", explain: "The stock token issuer blocks the depositing wallet. It can only be taken back." },
  DENYLISTED: { label: "Depositor on the denylist", explain: "The depositing wallet is on the Nuluvium denylist. It can only be taken back." },
  SOURCE_SANCTIONED: { label: "Funds from an OFAC-listed address", explain: "Part of these funds came from an address on the OFAC sanctions list. It can only be taken back." },
  SOURCE_ISSUER_BLOCKED: { label: "Funds from an issuer-blocked address", explain: "Part of these funds came from an address the stock token issuer blocks. It can only be taken back." },
  SOURCE_DENYLISTED: { label: "Funds from a denylisted address", explain: "Part of these funds came from an address on the Nuluvium denylist. It can only be taken back." },
};

/** The code of a refusal, or null when neither the code nor the text is known. */
export function reasonCode(entry: { reason?: string; code?: string }): ReasonCode | null {
  if (entry.code && entry.code in REASON_COPY) return entry.code as ReasonCode;
  return (entry.reason && CODE_BY_TEXT[entry.reason]) || null;
}
