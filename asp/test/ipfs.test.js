import assert from "node:assert/strict";
import { test } from "node:test";
import { rawCid } from "../src/cid.js";
import { IPFS_PENDING_KEY, IPFS_PINNED_KEY, IPFS_SEEDED_KEY, MAX_PINS_PER_RUN, pinPending, pinataUpload, queuePin, seedFromArchive } from "../src/ipfs.js";

function memoryKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key, type) {
      const value = data.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      if (type === "arrayBuffer") return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return value;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}

async function makeSet(n) {
  const root = BigInt(1000 + n);
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 2, root: root.toString(), approvedLabels: [String(n)], rejected: [] }, null, 2));
  const cid = await rawCid(bytes);
  return { bytes, cid, root, tx: `0x${n.toString(16).padStart(64, "0")}` };
}

async function setup(count) {
  const kv = memoryKv();
  const sets = [];
  for (let n = 1; n <= count; n += 1) {
    const set = await makeSet(n);
    sets.push(set);
    kv.data.set(`set:${set.cid}`, set.bytes);
    await queuePin(kv, { cid: set.cid, tx: set.tx });
  }
  const chain = Object.fromEntries(sets.map((set) => [set.tx, { root: set.root, cid: set.cid }]));
  return { kv, sets, readRootUpdated: async (tx) => chain[tx] };
}

test("pins queued sets after the chain + CID + root checks, and records them", async () => {
  const { kv, sets, readRootUpdated } = await setup(2);
  const uploads = [];
  const upload = async (bytes) => {
    uploads.push(bytes);
    return rawCid(bytes); // what a single-block IPFS upload reports
  };
  const result = await pinPending({ kv, readRootUpdated, upload });
  assert.deepEqual(result, { pinned: sets.map((set) => set.cid), failed: [] });
  assert.deepEqual(JSON.parse(kv.data.get(IPFS_PENDING_KEY)), []);
  assert.deepEqual(Object.keys(JSON.parse(kv.data.get(IPFS_PINNED_KEY))), sets.map((set) => set.cid));
  assert.deepEqual(uploads[0], sets[0].bytes);
});

test("a CID mismatch from the pinning service fails and keeps the set queued", async () => {
  const { kv, sets, readRootUpdated } = await setup(1);
  const result = await pinPending({ kv, readRootUpdated, upload: async () => "bafybeiotherotherotherotherotherotherotherotherotherother" });
  assert.equal(result.pinned.length, 0);
  assert.match(result.failed[0].error, /reports bafybei/);
  assert.deepEqual(JSON.parse(kv.data.get(IPFS_PENDING_KEY)).map((item) => item.cid), [sets[0].cid]);
});

test("a document that does not match the chain is never uploaded", async () => {
  const { kv, sets } = await setup(1);
  let uploaded = false;
  const result = await pinPending({
    kv,
    readRootUpdated: async () => ({ root: 1n, cid: sets[0].cid }),
    upload: async () => {
      uploaded = true;
    },
  });
  assert.equal(uploaded, false);
  assert.match(result.failed[0].error, /has root/);
});

test("pins at most MAX_PINS_PER_RUN per run; the rest wait for the next run", async () => {
  const { kv, readRootUpdated } = await setup(MAX_PINS_PER_RUN + 1);
  const upload = (bytes) => rawCid(bytes);
  assert.equal((await pinPending({ kv, readRootUpdated, upload })).pinned.length, MAX_PINS_PER_RUN);
  assert.equal((await pinPending({ kv, readRootUpdated, upload })).pinned.length, 1);
  assert.deepEqual(await pinPending({ kv, readRootUpdated, upload }), { pinned: [], failed: [] });
});

test("seeds the queue once from the archive index (sets with a document only)", async () => {
  const kv = memoryKv();
  const index = { sets: [{ cid: "placeholder", tx: "0x1", document: null }, { cid: "bafkreiaaa", tx: "0x2", document: "sets/bafkreiaaa.json" }] };
  let reads = 0;
  const fetchImpl = async () => {
    reads += 1;
    return new Response(JSON.stringify(index));
  };
  assert.equal(await seedFromArchive({ kv, indexUrl: "https://archive.example/index.json", fetchImpl }), 1);
  assert.deepEqual(JSON.parse(kv.data.get(IPFS_PENDING_KEY)), [{ cid: "bafkreiaaa", tx: "0x2" }]);
  assert.ok(kv.data.get(IPFS_SEEDED_KEY));
  assert.equal(await seedFromArchive({ kv, indexUrl: "https://archive.example/index.json", fetchImpl }), null);
  assert.equal(reads, 1);
});

test("Pinata upload: public network, bearer token, CID from data.cid, token never in errors", async () => {
  const JWT = "pinata-jwt-test-value";
  let seen;
  const ok = async (url, init) => {
    seen = { url, auth: init.headers.authorization, network: init.body.get("network"), file: init.body.get("file") };
    return new Response(JSON.stringify({ data: { cid: "bafkreitest" } }));
  };
  assert.equal(await pinataUpload({ jwt: JWT, bytes: new Uint8Array([1, 2]), name: "x.json", fetchImpl: ok }), "bafkreitest");
  assert.deepEqual([seen.url, seen.auth, seen.network, seen.file.size], ["https://uploads.pinata.cloud/v3/files", `Bearer ${JWT}`, "public", 2]);

  const denied = async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  await assert.rejects(pinataUpload({ jwt: JWT, bytes: new Uint8Array([1]), name: "x.json", fetchImpl: denied }), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes(JWT));
    return true;
  });
});
