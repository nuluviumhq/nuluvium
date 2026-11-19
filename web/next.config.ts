import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // The SDK is TypeScript source, installed from ../sdk as a copy (.npmrc install-links).
  transpilePackages: ["@nuluvium/sdk"],
  turbopack: {
    // Pinned so Turbopack does not walk up and pick another lockfile in the repo.
    root: dirname,
  },
};

export default nextConfig;

// Exposes Cloudflare bindings (and .dev.vars secrets) to `next dev`.
initOpenNextCloudflareForDev();
