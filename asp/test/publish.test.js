import assert from "node:assert/strict";
import { test } from "node:test";
import { rawCid } from "../src/cid.js";
import { PENDING_KEY, PUBLISHED_KEY, addToIndex, commitSet, githubClient, publishPending, queueSet, verifySet } from "../src/publish.js";

const TOKEN = "github_pat_test_value";
const REPO = "nuluviumhq/approved-sets";

async function makeSet(root, { approved = 3, rejected = 1 } = {}) {
  const document = {
    version: 1,
    root: root.toString(),
    approvedLabels: Array.from({ length: approved }, (_, i) => String(i + 1)),
    rejected: Array.from({ length: rejected }, (_, i) => ({ label: String(100 + i), reason: "denylist" })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(document, null, 2));
  const cid = await rawCid(bytes);
  const onchain = { root, cid, timestamp: 1_763_400_000n, block: 154_500_000n, tx: `0x${"ab".repeat(32)}` };
  return { document, bytes, cid, onchain };
}

const baseIndex = () => ({
  sets: [{ number: 1, cid: "setup-placeholder", root: "1", document: null }],
  scannedTo: "155269482",
  network: { name: "Robinhood Chain testnet", chainId: 46630 },
});

/** In-memory stand-in for the parts of the GitHub API that commitSet uses. */
function fakeGitHub(index = baseIndex()) {
  const state = {
    head: "c0",
    commits: { c0: { tree: "t0", files: { "index.json": `${JSON.stringify(index, null, 2)}\n` } } },
    blobs: {},
    calls: [],
    authHeaders: new Set(),
    raceOnce: false,
    failWith: null,
  };
  let id = 0;
  const reply = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
  const fetchImpl = async (url, init) => {
    const path = url.replace(`https://api.github.com/repos/${REPO}`, "");
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : null;
    state.calls.push(`${method} ${path.split("?")[0]}`);
    state.authHeaders.add(init.headers.authorization);
    if (state.failWith) return reply(state.failWith, { message: "Bad credentials" });

    if (method === "GET" && path === "/git/ref/heads/main") return reply(200, { object: { sha: state.head } });
    if (method === "GET" && path.startsWith("/contents/index.json?ref=")) {
      const sha = path.split("=")[1];
      const text = state.commits[sha].files["index.json"];
      return reply(200, { content: Buffer.from(text).toString("base64").replace(/(.{60})/g, "$1\n") });
    }
    if (method === "POST" && path === "/git/blobs") {
      const sha = `b${++id}`;
      state.blobs[sha] = body.encoding === "base64" ? Buffer.from(body.content, "base64") : Buffer.from(body.content, "utf8");
      return reply(201, { sha });
    }
    if (method === "GET" && path.startsWith("/git/commits/")) return reply(200, { tree: { sha: state.commits[path.split("/").pop()].tree } });
    if (method === "POST" && path === "/git/trees") {
      const base = Object.values(state.commits).find((commit) => commit.tree === body.base_tree);
      const files = { ...base.files };
      for (const entry of body.tree) files[entry.path] = state.blobs[entry.sha];
      const sha = `t${++id}`;
      state.trees = { ...state.trees, [sha]: files };
      return reply(201, { sha });
    }
    if (method === "POST" && path === "/git/commits") {
      const sha = `c${++id}`;
      state.commits[sha] = { tree: body.tree, files: state.trees[body.tree], parents: body.parents, message: body.message, author: body.author };
      return reply(201, { sha });
    }
    if (method === "PATCH" && path === "/git/refs/heads/main") {
      if (body.force !== false) throw new Error("must not force");
      if (state.raceOnce) {
        state.raceOnce = false;
        return reply(422, { message: "Update is not a fast forward" });
      }
      if (!state.commits[body.sha].parents.includes(state.head)) return reply(422, { message: "Update is not a fast forward" });
      state.head = body.sha;
      return reply(200, { object: { sha: body.sha } });
    }
    return reply(404, { message: `unexpected ${method} ${path}` });
  };
  const headFiles = () => state.commits[state.head].files;
  const headIndex = () => JSON.parse(headFiles()["index.json"].toString());
  return { state, fetchImpl, headFiles, headIndex };
}

function fakeKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    async get(key, type) {
      const value = store.get(key);
      if (value === undefined) return null;
      if (type === "json") return JSON.parse(value);
      if (type === "arrayBuffer") return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

test("verifySet accepts the document posted on chain", async () => {
  const set = await makeSet(42n);
  const document = await verifySet(set.bytes, set.onchain);
  assert.equal(document.root, "42");
});

test("verifySet refuses bytes that do not hash to the CID on chain", async () => {
  const set = await makeSet(42n);
  const changed = new TextEncoder().encode(new TextDecoder().decode(set.bytes).replace('"42"', '"42" '));
  await assert.rejects(verifySet(changed, set.onchain), /hashes to/);
});

test("verifySet refuses a document whose root is not the root on chain", async () => {
  const set = await makeSet(42n);
  await assert.rejects(verifySet(set.bytes, { ...set.onchain, root: 43n }), /chain says 43/);
});

test("verifySet refuses a non-document CID (setup roots)", async () => {
  const set = await makeSet(42n);
  await assert.rejects(verifySet(set.bytes, { ...set.onchain, cid: "nuluvium-testnet-setup" }), /not a document CID/);
});

test("addToIndex appends in export.mjs's format and keeps the scan cursor", async () => {
  const set = await makeSet(42n, { approved: 5, rejected: 2 });
  const next = addToIndex(baseIndex(), set.onchain, set.document);
  assert.deepEqual(next.sets.at(-1), {
    number: 2,
    cid: set.cid,
    root: "42",
    postedAt: new Date(1_763_400_000 * 1000).toISOString(),
    block: 154_500_000,
    tx: set.onchain.tx,
    document: `sets/${set.cid}.json`,
    approved: 5,
    rejected: 2,
  });
  assert.equal(next.scannedTo, "155269482");
  assert.equal(addToIndex(next, set.onchain, set.document), null);
});

test("commitSet writes the document byte for byte and the index in one commit", async () => {
  const set = await makeSet(7n);
  const gh = fakeGitHub();
  const result = await commitSet(githubClient({ token: TOKEN, repo: REPO, fetchImpl: gh.fetchImpl }), "main", set);
  assert.equal(result, "committed");
  assert.deepEqual(new Uint8Array(gh.headFiles()[`sets/${set.cid}.json`]), set.bytes);
  assert.ok(gh.headFiles()["index.json"].toString().endsWith("}\n"));
  assert.equal(gh.headIndex().sets.length, 2);
  const commit = gh.state.commits[gh.state.head];
  assert.equal(commit.author.name, "Nuluvium");
  assert.match(commit.message, /^Set 2: 3 approved, 1 rejected/);
  assert.equal(gh.state.calls.filter((call) => call.startsWith("PATCH")).length, 1);
  assert.deepEqual([...gh.state.authHeaders], [`Bearer ${TOKEN}`]);
});

test("commitSet does nothing when the set is already in the archive", async () => {
  const set = await makeSet(7n);
  const gh = fakeGitHub(addToIndex(baseIndex(), set.onchain, set.document));
  const result = await commitSet(githubClient({ token: TOKEN, repo: REPO, fetchImpl: gh.fetchImpl }), "main", set);
  assert.equal(result, "already");
  assert.equal(gh.state.calls.some((call) => call.startsWith("POST")), false);
});

test("GitHub errors carry GitHub's message, never the token", async () => {
  const gh = fakeGitHub();
  gh.state.failWith = 401;
  const github = githubClient({ token: TOKEN, repo: REPO, fetchImpl: gh.fetchImpl });
  await assert.rejects(github("GET", "/git/ref/heads/main"), (error) => {
    assert.match(error.message, /HTTP 401 Bad credentials/);
    assert.equal(error.message.includes(TOKEN), false);
    return true;
  });
});

function pendingSetup(set, { pending = [{ cid: set.cid, tx: set.onchain.tx }], latest } = {}) {
  const kv = fakeKv({ [`set:${set.cid}`]: set.bytes, [PENDING_KEY]: JSON.stringify(pending) });
  if (latest) kv.store.set("latest", JSON.stringify(latest));
  const gh = fakeGitHub();
  const chain = new Map([[set.onchain.tx, set.onchain]]);
  const readRootUpdated = async (tx) => {
    if (!chain.has(tx)) throw new Error(`unknown tx ${tx}`);
    return chain.get(tx);
  };
  const run = () =>
    publishPending({ kv, github: githubClient({ token: TOKEN, repo: REPO, fetchImpl: gh.fetchImpl }), branch: "main", readRootUpdated });
  return { kv, gh, chain, run };
}

test("publishPending commits a queued set and clears the queue", async () => {
  const set = await makeSet(9n);
  const { kv, gh, run } = pendingSetup(set, { latest: { cid: set.cid, tx: set.onchain.tx } });
  const result = await run();
  assert.deepEqual(result, { published: [{ cid: set.cid, result: "committed" }], failed: [] });
  assert.deepEqual(JSON.parse(kv.store.get(PENDING_KEY)), []);
  assert.equal(kv.store.get(PUBLISHED_KEY), set.cid);
  assert.equal(gh.headIndex().sets.at(-1).cid, set.cid);
  // Next run: nothing queued and the latest set is known to be published, so no GitHub calls.
  const calls = gh.state.calls.length;
  assert.deepEqual(await run(), { published: [], failed: [] });
  assert.equal(gh.state.calls.length, calls);
});

test("publishPending refuses a stored document that does not match the chain, and keeps it queued", async () => {
  const set = await makeSet(9n);
  const { kv, gh, chain, run } = pendingSetup(set);
  chain.set(set.onchain.tx, { ...set.onchain, root: 10n });
  const result = await run();
  assert.equal(result.published.length, 0);
  assert.match(result.failed[0].error, /chain says 10/);
  assert.equal(JSON.parse(kv.store.get(PENDING_KEY)).length, 1);
  assert.equal(gh.state.calls.length, 0);
});

test("publishPending refuses a tx that posted another CID", async () => {
  const set = await makeSet(9n);
  const other = await makeSet(11n);
  const { run, chain } = pendingSetup(set);
  chain.set(set.onchain.tx, { ...other.onchain, tx: set.onchain.tx });
  const result = await run();
  assert.match(result.failed[0].error, /expected/);
});

test("publishPending keeps the set queued when the branch moved meanwhile, then succeeds", async () => {
  const set = await makeSet(9n);
  const { kv, gh, run } = pendingSetup(set);
  gh.state.raceOnce = true;
  const first = await run();
  assert.match(first.failed[0].error, /HTTP 422/);
  assert.equal(JSON.parse(kv.store.get(PENDING_KEY)).length, 1);
  const second = await run();
  assert.equal(second.published[0].result, "committed");
  assert.equal(gh.headIndex().sets.length, 2);
});

test("publishPending picks up the latest set even if it was never queued", async () => {
  const set = await makeSet(9n);
  const { kv, gh, run } = pendingSetup(set, { pending: [], latest: { cid: set.cid, tx: set.onchain.tx } });
  const result = await run();
  assert.equal(result.published[0].result, "committed");
  assert.equal(kv.store.get(PUBLISHED_KEY), set.cid);
  assert.equal(gh.headIndex().sets.length, 2);
});

test("queueSet adds a set once", async () => {
  const kv = fakeKv();
  await queueSet(kv, { cid: "bx", tx: "0x1" });
  await queueSet(kv, { cid: "bx", tx: "0x1" });
  assert.deepEqual(JSON.parse(kv.store.get(PENDING_KEY)), [{ cid: "bx", tx: "0x1" }]);
});
