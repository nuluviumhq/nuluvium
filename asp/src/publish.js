// Publishes each posted approved set to the public archive repo (nuluviumhq/approved-sets), the
// same files scripts/export.mjs in that repo writes by hand: sets/<cid>.json (the document, byte for
// byte) and a new entry in index.json, in one commit.
//
// The chain is the source of truth: the root and CID come from the RootUpdated event in the
// updateRoot transaction, and the document must hash to that CID and carry that root, or nothing is
// committed. Needs the secret GITHUB_TOKEN: a fine-grained token for that one repo with
// "Contents: read and write". Without it, publishing is skipped and screening runs as before.

import { rawCid } from "./cid.js";

export const PENDING_KEY = "github:pending";
export const PUBLISHED_KEY = "github:published";

const CID_PATTERN = /^b[a-z2-7]{58}$/;
const AUTHOR = { name: "Nuluvium", email: "356919604+nuluviumhq@users.noreply.github.com" };

/** Throws unless the document bytes are what the chain says was posted. Returns the parsed document. */
export async function verifySet(bytes, onchain) {
  if (!CID_PATTERN.test(onchain.cid)) throw new Error(`CID on chain is not a document CID: ${onchain.cid}`);
  const cid = await rawCid(bytes);
  if (cid !== onchain.cid) throw new Error(`document for ${onchain.cid} hashes to ${cid}`);
  const document = JSON.parse(new TextDecoder().decode(bytes));
  if (BigInt(document.root) !== BigInt(onchain.root)) {
    throw new Error(`document ${onchain.cid} has root ${document.root}, chain says ${onchain.root}`);
  }
  return document;
}

/** index.json with the new set appended, in export.mjs's format. Returns null if it is already listed. */
export function addToIndex(index, onchain, document) {
  if (index.sets.some((set) => set.cid === onchain.cid)) return null;
  const entry = {
    number: index.sets.length + 1,
    cid: onchain.cid,
    root: BigInt(onchain.root).toString(),
    postedAt: new Date(Number(onchain.timestamp) * 1000).toISOString(),
    block: Number(onchain.block),
    tx: onchain.tx,
    document: `sets/${onchain.cid}.json`,
    approved: document.approvedLabels.length,
    rejected: document.rejected.length,
  };
  // scannedTo is left alone: it is export.mjs's own cursor, so a manual run still finds any set
  // this Worker missed.
  return { ...index, sets: [...index.sets, entry] };
}

const toBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/\s/g, "")), (char) => char.charCodeAt(0));

/** Minimal GitHub REST client for one repo. Error messages carry GitHub's text, never the token. */
export function githubClient({ token, repo, fetchImpl = fetch }) {
  return async function github(method, path, body) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "nuluvium-asp",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) {
      let message = text.slice(0, 200);
      try {
        message = JSON.parse(text).message ?? message;
      } catch {}
      throw new Error(`GitHub ${method} ${path.split("?")[0]}: HTTP ${response.status} ${message}`);
    }
    return text ? JSON.parse(text) : null;
  };
}

/**
 * Commits sets/<cid>.json and the updated index.json to `branch` in one commit (Git Data API).
 * Returns "committed" or "already" (the set is in index.json already). The branch is moved without
 * force, so a concurrent commit makes this throw and the set stays pending for the next run.
 */
export async function commitSet(github, branch, { bytes, onchain, document }) {
  const ref = await github("GET", `/git/ref/heads/${branch}`);
  const headSha = ref.object.sha;
  const current = await github("GET", `/contents/index.json?ref=${headSha}`);
  const index = JSON.parse(new TextDecoder().decode(fromBase64(current.content)));
  const nextIndex = addToIndex(index, onchain, document);
  if (!nextIndex) return "already";

  const setBlob = await github("POST", "/git/blobs", { content: toBase64(bytes), encoding: "base64" });
  const indexBlob = await github("POST", "/git/blobs", { content: `${JSON.stringify(nextIndex, null, 2)}\n`, encoding: "utf-8" });
  const head = await github("GET", `/git/commits/${headSha}`);
  const tree = await github("POST", "/git/trees", {
    base_tree: head.tree.sha,
    tree: [
      { path: `sets/${onchain.cid}.json`, mode: "100644", type: "blob", sha: setBlob.sha },
      { path: "index.json", mode: "100644", type: "blob", sha: indexBlob.sha },
    ],
  });
  const number = nextIndex.sets.length;
  const signature = { ...AUTHOR, date: new Date().toISOString() };
  const commit = await github("POST", "/git/commits", {
    message: `Set ${number}: ${document.approvedLabels.length} approved, ${document.rejected.length} rejected\n\nRoot ${onchain.root}, tx ${onchain.tx}`,
    tree: tree.sha,
    parents: [headSha],
    author: signature,
    committer: signature,
  });
  await github("PATCH", `/git/refs/heads/${branch}`, { sha: commit.sha, force: false });
  return "committed";
}

/**
 * Publishes every pending set, plus the latest posted one (covers sets posted before this code ran).
 * `readRootUpdated(tx)` returns { root, cid, timestamp, block, tx } from the chain.
 * Sets that fail stay pending; one failure does not stop the others.
 */
export async function publishPending({ kv, github, branch, readRootUpdated }) {
  const pending = (await kv.get(PENDING_KEY, "json")) ?? [];
  const latest = await kv.get("latest", "json");
  const published = await kv.get(PUBLISHED_KEY);
  const queue = [...pending];
  if (latest?.cid && latest.cid !== published && !queue.some((item) => item.cid === latest.cid)) {
    queue.push({ cid: latest.cid, tx: latest.tx });
  }
  if (queue.length === 0) return { published: [], failed: [] };

  const done = [];
  const failed = [];
  for (const item of queue) {
    try {
      const onchain = await readRootUpdated(item.tx);
      if (onchain.cid !== item.cid) throw new Error(`tx ${item.tx} posted ${onchain.cid}, expected ${item.cid}`);
      const bytes = await kv.get(`set:${item.cid}`, "arrayBuffer");
      if (!bytes) throw new Error(`no document stored for ${item.cid}`);
      const view = new Uint8Array(bytes);
      const document = await verifySet(view, onchain);
      const result = await commitSet(github, branch, { bytes: view, onchain, document });
      done.push({ cid: item.cid, result });
    } catch (error) {
      failed.push({ cid: item.cid, error: error.shortMessage ?? error.message });
    }
  }

  const doneCids = new Set(done.map((item) => item.cid));
  const stillPending = pending.filter((item) => !doneCids.has(item.cid));
  if (stillPending.length !== pending.length) await kv.put(PENDING_KEY, JSON.stringify(stillPending));
  if (latest?.cid && doneCids.has(latest.cid)) await kv.put(PUBLISHED_KEY, latest.cid);
  return { published: done, failed };
}

/** Adds a freshly posted set to the queue (called right after updateRoot succeeds). */
export async function queueSet(kv, item) {
  const pending = (await kv.get(PENDING_KEY, "json")) ?? [];
  if (pending.some((entry) => entry.cid === item.cid)) return;
  await kv.put(PENDING_KEY, JSON.stringify([...pending, item]));
}
