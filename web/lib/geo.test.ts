// Run: node --test lib/geo.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED_COUNTRIES, isBlockedCountry, isGatedPath } from "./geo.ts";

test("blocks the US and its territories, the issuer lists, the EU and Tor", () => {
  for (const code of ["US", "PR", "CU", "RU", "UA", "CA", "GB", "CH", "DE", "FR", "NL", "IE", "T1", "us"]) {
    assert.equal(isBlockedCountry(code), true, code);
  }
  assert.equal(BLOCKED_COUNTRIES.size, 7 + 11 + 3 + 27);
});

test("allows other countries and requests without a country (local development)", () => {
  for (const code of ["ID", "SG", "JP", "BR", "AE", "NO", "AU", null, undefined, ""]) {
    assert.equal(isBlockedCountry(code), false, String(code));
  }
});

test("gates the app and its API, not the site", () => {
  for (const path of ["/app", "/app/trade", "/api/rpc"]) assert.equal(isGatedPath(path), true, path);
  for (const path of ["/", "/product", "/terms", "/applications", "/blocked"]) assert.equal(isGatedPath(path), false, path);
});
