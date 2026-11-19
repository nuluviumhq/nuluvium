// Node-only parts of @nuluvium/sdk (import from "@nuluvium/sdk/node").

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Circuits, PrivacyPoolSDK } from "@0xbow/privacy-pools-core-sdk";

/**
 * Circuits loader reading wasm/zkey/vkey from a folder (see testnet/setup-artifacts.mjs).
 * The SDK still checks every file against its pinned SHA-256 hashes.
 */
class FolderCircuits extends Circuits {
  readonly folder: string;

  constructor(folder: string) {
    super({ browser: false });
    this.folder = folder;
  }

  override async _fetchVersionedArtifact(artifactPath: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.folder, basename(artifactPath))));
  }
}

/** Prover reading the circuit files from a local folder. */
export function createFolderProver(artifactFolder: string): PrivacyPoolSDK {
  return new PrivacyPoolSDK(new FolderCircuits(artifactFolder));
}
