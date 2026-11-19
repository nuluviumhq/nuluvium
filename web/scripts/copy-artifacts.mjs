// Copies the Privacy Pools circuit files (trusted-setup final keys + compiled wasm, pinned
// submodule) to public/artifacts, where the browser prover downloads them (/artifacts/*).
// The SDK checks each file against its pinned SHA-256 hashes. Runs before dev and build.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const circuits = join(web, "..", "contracts", "lib", "privacy-pools-core", "packages", "circuits");
const out = join(web, "public", "artifacts");
if (!existsSync(circuits)) throw new Error(`Circuit files not found at ${circuits} (git submodule update --init)`);
mkdirSync(out, { recursive: true });

for (const circuit of ["commitment", "withdraw"]) {
  copyFileSync(join(circuits, "trusted-setup", "final-keys", `${circuit}.zkey`), join(out, `${circuit}.zkey`));
  // JSON text: restore LF endings in case git checked it out with CRLF (changes the hash).
  const vkey = readFileSync(join(circuits, "trusted-setup", "final-keys", `${circuit}.vkey`), "utf8");
  writeFileSync(join(out, `${circuit}.vkey`), vkey.replace(/\r\n/g, "\n"));
  copyFileSync(join(circuits, "build", circuit, `${circuit}_js`, `${circuit}.wasm`), join(out, `${circuit}.wasm`));
}
console.log("Circuit files copied to public/artifacts");
