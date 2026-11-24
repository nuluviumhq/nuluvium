import assert from "node:assert/strict";
import { test } from "node:test";
import { REASON_COPY, reasonCode } from "./reasons.ts";

test("reason code from the published code, or from the text of older sets", () => {
  assert.equal(reasonCode({ code: "OVER_TOTAL_CAP", reason: "approved total would exceed the total cap" }), "OVER_TOTAL_CAP");
  assert.equal(reasonCode({ reason: "deposit above the per-deposit cap" }), "OVER_DEPOSIT_CAP");
  assert.equal(reasonCode({ reason: "funds came from an address on the OFAC sanctions list" }), "SOURCE_SANCTIONED");
  assert.equal(reasonCode({ code: "SOMETHING_NEW", reason: "a new rule" }), null);
});

test("every code has a label and an explanation", () => {
  for (const copy of Object.values(REASON_COPY)) {
    assert.ok(copy.label.length > 0);
    assert.ok(copy.explain.length > 0);
  }
});
