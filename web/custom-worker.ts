// Worker entry point: the OpenNext app behind a country check.
//
// The app (/app/*) and its API (/api/*) are refused where Nuluvium is not offered (lib/geo.ts),
// using Cloudflare's own country for the request (request.cf.country, set by Cloudflare, not the
// visitor). The site pages stay readable everywhere. VPNs get around this, which is why wallets
// are screened too (ASP, issuer blocklist).

// `.open-next/worker.js` only exists after `opennextjs-cloudflare build`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";
import { canonicalRedirect } from "./lib/canonical";
import { isBlockedCountry, isGatedPath } from "./lib/geo";
import { serveWithRanges } from "./lib/ranges";

const worker: ExportedHandler<CloudflareEnv> = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // http:// and www. go to https://nuluvium.com (lib/canonical.ts).
    const canonical = canonicalRedirect(url);
    if (canonical) return Response.redirect(canonical, 301);
    const country = (request.cf as { country?: string } | undefined)?.country;
    // Video files come here first (wrangler.jsonc run_worker_first) so Safari gets byte ranges.
    if (url.pathname.endsWith(".mp4") && env.ASSETS) return serveWithRanges(request, env.ASSETS);

    if (isGatedPath(url.pathname) && isBlockedCountry(country)) {
      if (url.pathname.startsWith("/api/")) {
        return Response.json({ error: "Nuluvium is not available in your country" }, { status: 451 });
      }
      // Serve the static "not available" page with the right status.
      const page = await handler.fetch(new Request(new URL("/blocked", url), request), env, ctx);
      return new Response(page.body, { status: 451, headers: page.headers });
    }
    // The RPC proxy is public: limit calls per visitor (Cloudflare rate limiting; nothing stored).
    if (url.pathname === "/api/rpc") {
      const visitor = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.RPC_LIMITER.limit({ key: visitor });
      if (!success) return Response.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;

// Durable Object classes OpenNext may reference must be re-exported.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
