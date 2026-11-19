// Circuit files (wasm, zkey, vkey for the commitment and withdraw circuits, about 23 MB) that the
// prover needs. Run from source they come from testnet/setup-artifacts.mjs; installed from npm they
// are downloaded once from the Nuluvium site into ~/.nuluvium/artifacts. Where they come from does
// not matter for safety: the Privacy Pools SDK checks every file against its pinned SHA-256 hashes
// before proving, so a changed file is refused.

import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const ARTIFACT_FILES = ["commitment.wasm", "commitment.zkey", "commitment.vkey", "withdraw.wasm", "withdraw.zkey", "withdraw.vkey"];

/** The files still missing from `folder`. */
export function missingArtifacts(folder: string): string[] {
  return ARTIFACT_FILES.filter((name) => !existsSync(join(folder, name)));
}

/**
 * Downloads the missing files from `baseUrl` (e.g. https://…/artifacts) into `folder`. Each file is
 * written to a temporary name first and renamed when complete, so an interrupted download is
 * fetched again next time instead of being used half-written.
 */
export async function ensureArtifacts(folder: string, baseUrl: string, log: (message: string) => void = () => {}): Promise<void> {
  const missing = missingArtifacts(folder);
  if (missing.length === 0) return;
  await mkdir(folder, { recursive: true });
  log(`downloading ${missing.length} circuit files (about 23 MB, once) into ${folder}`);
  for (const name of missing) {
    const response = await fetch(`${baseUrl}/${name}`, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`could not download circuit file ${name} (HTTP ${response.status})`);
    const partial = join(folder, `${name}.partial`);
    try {
      await writeFile(partial, new Uint8Array(await response.arrayBuffer()));
      await rename(partial, join(folder, name));
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
  }
  log("circuit files ready");
}
