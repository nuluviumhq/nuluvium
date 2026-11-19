// One address for the site: https://nuluvium.com. Plain http and the www host redirect there
// (301, path and query kept), so links, cookies and Privy's allowed origins all see one origin.
// Other hosts (the workers.dev address, localhost) are left alone.

export const CANONICAL_HOST = "nuluvium.com";
const OUR_HOSTS = new Set([CANONICAL_HOST, `www.${CANONICAL_HOST}`]);

/** The URL to redirect to, or null when the request is already on the canonical address. */
export function canonicalRedirect(url: URL): string | null {
  if (!OUR_HOSTS.has(url.hostname)) return null;
  if (url.protocol === "https:" && url.hostname === CANONICAL_HOST) return null;
  return `https://${CANONICAL_HOST}${url.pathname}${url.search}`;
}
