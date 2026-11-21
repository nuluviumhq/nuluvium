// Pins each posted approved set to public IPFS through Pinata, so the CID posted on chain can be
// fetched from any IPFS gateway, not only from asp.nuluvium.com or the GitHub archive.
//
// Same checks as the GitHub publish (and the approved-sets scripts): the root and CID come from the
// RootUpdated event of the updateRoot transaction, the stored document must hash to that CID and
// carry that root, and the CID Pinata reports must be the same CID. A set document is one small
// file (well under Pinata's 256 KiB chunk size), so its IPFS CID (CIDv1, raw leaf, SHA-256) is the
// raw CID the ASP computes. A mismatch is an error and the set stays queued.
//
// Needs the secret PINATA_JWT (Pinata API key with file upload rights). Without it, pinning is
// skipped. On its first run with the secret it also queues every earlier set listed in the public
// archive's index.json, so the history is pinned too.

import { verifySet } from "./publish.js";

export const IPFS_PENDING_KEY = "ipfs:pending";
export const IPFS_PINNED_KEY = "ipfs:pinned"; // { cid: pinnedAt } for every pinned set
export const IPFS_SEEDED_KEY = "ipfs:seeded";
export const MAX_PINS_PER_RUN = 3; // each pin is 2 subrequests (receipt + upload)
const UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const TIMEOUT_MS = 15_000;

/** Uploads the document to public IPFS. Returns the CID Pinata reports. Errors never carry the token. */
export async function pinataUpload({ jwt, bytes, name, fetchImpl = fetch }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/json" }), name);
  form.append("network", "public");
  form.append("name", name);
  let response;
  try {
    response = await fetchImpl(UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${jwt}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Pinata upload failed: ${error.name}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`Pinata upload failed: HTTP ${response.status} ${text.slice(0, 160)}`);
  const cid = JSON.parse(text).data?.cid;
  if (!cid) throw new Error("Pinata upload returned no CID");
  return cid;
}

/** Adds a freshly posted set to the pin queue (called right after updateRoot succeeds). */
export async function queuePin(kv, item) {
  const pending = (await kv.get(IPFS_PENDING_KEY, "json")) ?? [];
  if (pending.some((entry) => entry.cid === item.cid)) return;
  await kv.put(IPFS_PENDING_KEY, JSON.stringify([...pending, item]));
}

/**
 * Once: queues every set with a document in the public archive's index.json (cid + tx).
 * Returns the number queued, or null if it ran before.
 */
export async function seedFromArchive({ kv, indexUrl, fetchImpl = fetch }) {
  if (await kv.get(IPFS_SEEDED_KEY)) return null;
  const response = await fetchImpl(indexUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`archive index: HTTP ${response.status}`);
  const index = await response.json();
  const pending = (await kv.get(IPFS_PENDING_KEY, "json")) ?? [];
  const known = new Set(pending.map((item) => item.cid));
  const added = index.sets.filter((set) => set.document && set.tx && !known.has(set.cid)).map((set) => ({ cid: set.cid, tx: set.tx }));
  await kv.put(IPFS_PENDING_KEY, JSON.stringify([...added, ...pending]));
  await kv.put(IPFS_SEEDED_KEY, new Date().toISOString());
  return added.length;
}

/**
 * Pins up to MAX_PINS_PER_RUN queued sets. `readRootUpdated(tx)` returns { root, cid, ... } from
 * the chain; `upload(bytes, name)` returns the CID the pinning service reports.
 * Sets that fail stay queued; one failure does not stop the others.
 */
export async function pinPending({ kv, readRootUpdated, upload }) {
  const pending = (await kv.get(IPFS_PENDING_KEY, "json")) ?? [];
  if (pending.length === 0) return { pinned: [], failed: [] };
  const pinnedMap = (await kv.get(IPFS_PINNED_KEY, "json")) ?? {};

  const pinned = [];
  const failed = [];
  const done = new Set();
  for (const item of pending) {
    if (pinnedMap[item.cid]) {
      done.add(item.cid);
      continue;
    }
    if (pinned.length + failed.length >= MAX_PINS_PER_RUN) break;
    try {
      const onchain = await readRootUpdated(item.tx);
      if (onchain.cid !== item.cid) throw new Error(`tx ${item.tx} posted ${onchain.cid}, expected ${item.cid}`);
      const stored = await kv.get(`set:${item.cid}`, "arrayBuffer");
      if (!stored) throw new Error(`no document stored for ${item.cid}`);
      const bytes = new Uint8Array(stored);
      await verifySet(bytes, onchain);
      const reported = await upload(bytes, `${item.cid}.json`);
      if (reported !== item.cid) throw new Error(`pinning service reports ${reported} for ${item.cid}`);
      pinnedMap[item.cid] = new Date().toISOString();
      done.add(item.cid);
      pinned.push(item.cid);
    } catch (error) {
      failed.push({ cid: item.cid, error: error.shortMessage ?? error.message });
    }
  }

  if (done.size > 0) {
    await kv.put(IPFS_PINNED_KEY, JSON.stringify(pinnedMap));
    await kv.put(IPFS_PENDING_KEY, JSON.stringify(pending.filter((item) => !done.has(item.cid))));
  }
  return { pinned, failed };
}
