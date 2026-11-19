import assert from "node:assert/strict";
import { test } from "node:test";
import { callRefusal, logAddresses, originRefusal } from "./rpcPolicy.ts";

const CONTRACTS = { pool: "0x2B38bF53acc21a51603E68f5BC3bC8943B01fD4a", router: "0x3287C2947f137c20c8BfeB628f800D23b8e5D155", entrypoint: "0x1C7Bd821a61A90BA06e21aac4e03640E3D065536" };
const LOGS = logAddresses(CONTRACTS);

const SITE = "https://nuluvium.com";

test("origin: the site, Privy, localhost, wallet extensions and no Origin are served", () => {
  for (const origin of [SITE, "https://auth.privy.io", "http://localhost:3047", "chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn", null]) {
    assert.equal(originRefusal(origin, SITE), null, String(origin));
  }
});

test("origin: other websites are refused", () => {
  for (const origin of ["https://evil.example", "https://nuluvium.com.evil.example", "http://localhost.evil.example"]) {
    assert.notEqual(originRefusal(origin, SITE), null, origin);
  }
});

test("methods outside the read list are refused", () => {
  assert.equal(callRefusal({ method: "eth_call", params: [] }, LOGS), null);
  for (const method of ["eth_sendTransaction", "eth_sign", "debug_traceTransaction", "admin_peers", 42]) {
    assert.equal(callRefusal({ method }, LOGS), "method not allowed", String(method));
  }
});

test("logs: only our contracts, explicit hex blocks, at most 10,000 blocks", () => {
  const logs = (address: string, fromBlock: unknown, toBlock: unknown) => callRefusal({ method: "eth_getLogs", params: [{ address, fromBlock, toBlock }] }, LOGS);
  assert.equal(logs(CONTRACTS.pool, "0x1", "0x2710"), null);
  assert.match(logs("0x0000000000000000000000000000000000000001", "0x1", "0x2")!, /only served/);
  assert.match(logs(CONTRACTS.router, "latest", "0x2")!, /explicit hex/);
  assert.match(logs(CONTRACTS.router, "0xzz", "0x2")!, /explicit hex/); // used to throw inside BigInt
  assert.match(logs(CONTRACTS.router, "0x1", "0x2712")!, /too large/);
  assert.match(logs(CONTRACTS.router, "0x10", "0x1")!, /too large/);
});
