import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalRedirect } from "./canonical.ts";

test("http and www go to https://nuluvium.com, keeping path and query", () => {
  assert.equal(canonicalRedirect(new URL("http://nuluvium.com/stats")), "https://nuluvium.com/stats");
  assert.equal(canonicalRedirect(new URL("https://www.nuluvium.com/app/trade?x=1")), "https://nuluvium.com/app/trade?x=1");
  assert.equal(canonicalRedirect(new URL("http://www.nuluvium.com/")), "https://nuluvium.com/");
});

test("the canonical address and other hosts are left alone", () => {
  assert.equal(canonicalRedirect(new URL("https://nuluvium.com/docs")), null);
  assert.equal(canonicalRedirect(new URL("https://example.workers.dev/")), null);
  assert.equal(canonicalRedirect(new URL("http://localhost:3047/")), null);
});
