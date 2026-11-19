// Where Nuluvium is not offered:
// - the United States and its territories (stock tokens are not for US persons);
// - the stock token issuer's prohibited list and restricted list;
// - the European Union, until a legal opinion on MiFID/MiCA (decided 2026-11-16).
// The site stays readable everywhere; the app and its API are refused.

const UNITED_STATES = ["US", "PR", "GU", "VI", "AS", "MP", "UM"];
const ISSUER_PROHIBITED = ["CU", "BY", "IR", "KP", "RU", "SY", "UA", "SS", "SD", "MM", "VE"];
const ISSUER_RESTRICTED = ["CA", "GB", "CH"];
const EUROPEAN_UNION = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set([
  ...UNITED_STATES,
  ...ISSUER_PROHIBITED,
  ...ISSUER_RESTRICTED,
  ...EUROPEAN_UNION,
]);

/** Paths that need an allowed country: the app and everything it calls. */
export function isGatedPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/api/");
}

/**
 * True when a request from `country` (ISO 3166-1 alpha-2, from Cloudflare) may not use the app.
 * Cloudflare's "T1" (Tor) is refused too: the country cannot be known. Unknown or missing country
 * (local development) is allowed; in production Cloudflare always sets it.
 */
export function isBlockedCountry(country: string | null | undefined): boolean {
  if (!country) return false;
  const code = country.toUpperCase();
  return code === "T1" || BLOCKED_COUNTRIES.has(code);
}
