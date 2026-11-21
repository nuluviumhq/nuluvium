import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TRACES_PER_RUN, TRACES_KEY, attachSources, senderAddresses, traceSources } from "../src/trace.js";

const RPC = "https://rpc.example/v2/secret-key-value";
const USDG = "0xd26d58F86cf82c702b558D6E7F159939E97F0Bfa";
const ALICE = "0x00000000000000000000000000000000000A11CE";
const FAUCET = "0x00000000000000000000000000000000000000fa";

function memoryKv(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(key, type) {
      const value = data.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key, value) {
      data.set(key, value);
    },
  };
}

/** Fake Alchemy: answers alchemy_getAssetTransfers, records each request body. */
function fakeRpc({ fail = false, pageKey } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (fail) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "Method not found" } }));
    const transfers = [{ from: FAUCET, to: body.params[0].toAddress, rawContract: { address: USDG.toLowerCase(), value: "0x1312d00" } }];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { transfers, ...(pageKey ? { pageKey } : {}) } }));
  };
  return { calls, fetchImpl };
}

const deposit = (label, block) => ({ label: BigInt(label), depositor: ALICE, value: 20_000_000n, blockNumber: BigInt(block), logIndex: 0 });

test("traceSources asks for USDG sent to the depositor up to the deposit block, newest first, capped", async () => {
  const rpc = fakeRpc({ pageKey: "next" });
  const result = await traceSources({ rpcUrl: RPC, usdg: USDG, depositor: ALICE, toBlock: 255n, fetchImpl: rpc.fetchImpl });
  const params = rpc.calls[0].body.params[0];
  assert.equal(rpc.calls[0].body.method, "alchemy_getAssetTransfers");
  assert.deepEqual([params.toAddress, params.contractAddresses[0], params.toBlock, params.order, params.maxCount], [ALICE, USDG, "0xff", "desc", "0x64"]);
  assert.deepEqual(result, { transfers: [{ from: FAUCET, value: "20000000" }], truncated: true });
});

test("errors never carry the RPC URL", async () => {
  const rpc = fakeRpc({ fail: true });
  await assert.rejects(traceSources({ rpcUrl: RPC, usdg: USDG, depositor: ALICE, toBlock: 1n, fetchImpl: rpc.fetchImpl }), (error) => {
    assert.ok(!error.message.includes("secret-key-value"));
    return true;
  });
  const throwing = async () => {
    throw new TypeError(`fetch failed for ${RPC}`);
  };
  await assert.rejects(traceSources({ rpcUrl: RPC, usdg: USDG, depositor: ALICE, toBlock: 1n, fetchImpl: throwing }), (error) => {
    assert.equal(error.message, "trace request failed: TypeError");
    return true;
  });
});

test("attachSources traces each deposit once, keeps traces in KV and caps requests per run", async () => {
  const kv = memoryKv();
  const rpc = fakeRpc();
  const deposits = Array.from({ length: MAX_TRACES_PER_RUN + 2 }, (_, i) => deposit(i + 1, 100 + i));
  const first = await attachSources(deposits, { kv, rpcUrl: RPC, usdg: USDG, fetchImpl: rpc.fetchImpl });
  assert.equal(first.traced, MAX_TRACES_PER_RUN);
  assert.equal(first.deposits.filter((item) => item.sources === null).length, 2);
  assert.equal(first.deposits[0].sources.transfers[0].value, 20_000_000n);

  const second = await attachSources(deposits, { kv, rpcUrl: RPC, usdg: USDG, fetchImpl: rpc.fetchImpl });
  assert.equal(second.traced, 2);
  assert.equal(rpc.calls.length, MAX_TRACES_PER_RUN + 2);
  assert.equal(Object.keys(JSON.parse(kv.data.get(TRACES_KEY))).length, MAX_TRACES_PER_RUN + 2);

  const third = await attachSources(deposits, { kv, rpcUrl: RPC, usdg: USDG, fetchImpl: rpc.fetchImpl });
  assert.equal(third.traced, 0);
  assert.equal(rpc.calls.length, MAX_TRACES_PER_RUN + 2);
  assert.deepEqual([...new Set(senderAddresses(third.deposits))], [FAUCET]);
});

test("a failed trace saves nothing and leaves the deposit untraced (fail closed)", async () => {
  const kv = memoryKv();
  const result = await attachSources([deposit(1, 100)], { kv, rpcUrl: RPC, usdg: USDG, fetchImpl: fakeRpc({ fail: true }).fetchImpl });
  assert.equal(result.deposits[0].sources, null);
  assert.equal(result.failed.length, 1);
  assert.equal(kv.data.has(TRACES_KEY), false);
});
