import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { PublicClient } from "viem";
// @ts-expect-error plain JS module of the ASP Worker (same CID format the ASP publishes)
import { rawCid } from "../../asp/src/cid.js";
import { fetchApprovedSet, rootOf } from "../src/asp.ts";
import { ROBINHOOD_TESTNET } from "../src/config.ts";

const config = { ...ROBINHOOD_TESTNET, aspUrl: "https://asp.test", logChunk: 10_000n };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A set document as the ASP publishes it, with its CID. */
async function setDocument(labels: bigint[]) {
  const bytes = new TextEncoder().encode(JSON.stringify({ root: rootOf(labels).toString(), approvedLabels: labels.map(String), rejected: [] }));
  return { cid: (await rawCid(bytes)) as string, bytes };
}

/** Fake ASP: GET / names `statusCid`; /sets/<cid> serves the given documents. */
function serveAsp(statusCid: string, documents: Array<{ cid: string; bytes: Uint8Array }>) {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url === `${config.aspUrl}/`) return new Response(JSON.stringify({ latest: { cid: statusCid } }));
    const found = documents.find((document) => url === `${config.aspUrl}/sets/${document.cid}`);
    return found ? new Response(found.bytes as Uint8Array<ArrayBuffer>) : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

/** Fake chain: the latest root, and RootUpdated events; counts event queries. */
function fakeClient(onchainRoot: bigint, events: Array<{ root: bigint; cid: string }>) {
  const calls = { events: 0 };
  const client = {
    readContract: async () => onchainRoot,
    getBlockNumber: async () => 1_000_000n,
    getContractEvents: async () => {
      calls.events += 1;
      return events.map((event) => ({ args: { _root: event.root, _ipfsCID: event.cid } }));
    },
  } as unknown as PublicClient;
  return { client, calls };
}

test("the ASP status is used when it matches the root on chain (no event query)", async () => {
  const current = await setDocument([1n, 2n, 3n]);
  serveAsp(current.cid, [current]);
  const { client, calls } = fakeClient(rootOf([1n, 2n, 3n]), []);
  const set = await fetchApprovedSet(client, config);
  assert.equal(set.cid, current.cid);
  assert.deepEqual(set.labels, [1n, 2n, 3n]);
  assert.equal(calls.events, 0);
});

test("when the ASP status lags, the CID comes from the chain's RootUpdated event", async () => {
  const previous = await setDocument([1n, 2n]);
  const current = await setDocument([1n, 2n, 3n]);
  serveAsp(previous.cid, [previous, current]);
  const { client, calls } = fakeClient(rootOf([1n, 2n, 3n]), [
    { root: rootOf([1n, 2n]), cid: previous.cid },
    { root: rootOf([1n, 2n, 3n]), cid: current.cid },
  ]);
  const set = await fetchApprovedSet(client, config);
  assert.equal(set.cid, current.cid);
  assert.deepEqual(set.labels, [1n, 2n, 3n]);
  assert.equal(calls.events, 1);
});

test("no recent event for the root on chain: a clear error, not a stale set", async () => {
  const previous = await setDocument([1n, 2n]);
  serveAsp(previous.cid, [previous]);
  const { client } = fakeClient(rootOf([1n, 2n, 3n]), [{ root: rootOf([1n, 2n]), cid: previous.cid }]);
  await assert.rejects(fetchApprovedSet(client, config), /no recent RootUpdated event/);
});

test("a document that does not hash to its CID is refused", async () => {
  const current = await setDocument([1n, 2n, 3n]);
  const tampered = { cid: current.cid, bytes: new TextEncoder().encode(new TextDecoder().decode(current.bytes).replace('"3"', '"4"')) };
  serveAsp(current.cid, [tampered]);
  const { client } = fakeClient(rootOf([1n, 2n, 3n]), []);
  await assert.rejects(fetchApprovedSet(client, config), /does not match its CID/);
});
