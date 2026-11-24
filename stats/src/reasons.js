// Stable codes for the clean-funds check's refusals, as the ASP publishes them (asp/src/screen.js
// REASONS). Sets published before the codes existed carry only the text, so the code is looked up.
const CODE_BY_TEXT = {
  "depositor on the OFAC sanctions list": "SANCTIONED",
  "depositor blocked by the stock token issuer": "ISSUER_BLOCKED",
  "depositor on the Nuluvium denylist": "DENYLISTED",
  "funds came from an address on the OFAC sanctions list": "SOURCE_SANCTIONED",
  "funds came from an address blocked by the stock token issuer": "SOURCE_ISSUER_BLOCKED",
  "funds came from an address on the Nuluvium denylist": "SOURCE_DENYLISTED",
  "deposit above the per-deposit cap": "OVER_DEPOSIT_CAP",
  "approved total would exceed the total cap": "OVER_TOTAL_CAP",
};

/** @param {{reason: string, code?: string}} item @returns {string} the code, or "OTHER" for an unknown text */
export const reasonCode = (item) => item.code ?? CODE_BY_TEXT[item.reason] ?? "OTHER";

/** Refusals counted by code. @param {Array<{reason: string, code?: string}>} rejected */
export function countCodes(rejected) {
  const codes = {};
  for (const item of rejected) codes[reasonCode(item)] = (codes[reasonCode(item)] ?? 0) + 1;
  return codes;
}
