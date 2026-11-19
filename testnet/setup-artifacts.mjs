// Copies the Privacy Pools circuit files (trusted-setup final keys + compiled wasm) from the pinned
// submodule into ./artifacts (git-ignored). Same files and names as upstream's SDK setup script.
// Run once: node setup-artifacts.mjs

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARTIFACT_DIR, ROOT } from "./lib.mjs";

const circuitsDir = join(ROOT, "contracts", "lib", "privacy-pools-core", "packages", "circuits");
mkdirSync(ARTIFACT_DIR, { recursive: true });

for (const circuit of ["commitment", "withdraw"]) {
  copyFileSync(join(circuitsDir, "trusted-setup", "final-keys", `${circuit}.zkey`), join(ARTIFACT_DIR, `${circuit}.zkey`));
  // The vkey is JSON text. Git on Windows may check it out with CRLF line endings, which changes its
  // SHA-256 and fails the SDK's integrity check, so restore the LF endings upstream committed.
  const vkey = readFileSync(join(circuitsDir, "trusted-setup", "final-keys", `${circuit}.vkey`), "utf8");
  writeFileSync(join(ARTIFACT_DIR, `${circuit}.vkey`), vkey.replace(/\r\n/g, "\n"));
  copyFileSync(join(circuitsDir, "build", circuit, `${circuit}_js`, `${circuit}.wasm`), join(ARTIFACT_DIR, `${circuit}.wasm`));
}
console.log(`Circuit artifacts copied to ${ARTIFACT_DIR}`);
