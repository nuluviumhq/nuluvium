import assert from "node:assert/strict";
import { test } from "node:test";
import { planPieces } from "../src/planner.ts";

const USDG = 1_000_000n;

/** Small seeded generator (mulberry32) so plans are reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = { amount: 50n * USDG, pieces: 5, windowSeconds: 600, start: 1_000_000, minPiece: 5n * USDG, minGapSeconds: 30 };

test("pieces add up exactly, respect the minimum and are whole cents except the last", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const plan = planPieces({ ...base, random: seeded(seed) });
    assert.equal(plan.length, 5);
    assert.equal(plan.reduce((sum, piece) => sum + piece.amount, 0n), base.amount);
    for (const piece of plan) assert.ok(piece.amount >= base.minPiece, `piece below minimum (seed ${seed})`);
    for (const piece of plan.slice(0, -1)) assert.equal(piece.amount % 10_000n, 0n);
  }
});

test("times are in the window, in order, and at least the minimum gap apart", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const plan = planPieces({ ...base, random: seeded(seed) });
    for (const piece of plan) {
      assert.ok(piece.at >= base.start && piece.at <= base.start + base.windowSeconds, `outside window (seed ${seed})`);
    }
    for (let i = 1; i < plan.length; i++) {
      assert.ok(plan[i]!.at - plan[i - 1]!.at >= base.minGapSeconds, `gap too small (seed ${seed})`);
    }
  }
});

test("sizes actually vary", () => {
  const plan = planPieces({ ...base, random: seeded(7) });
  const sizes = new Set(plan.map((piece) => piece.amount));
  assert.ok(sizes.size >= 4, "expected different piece sizes");
});

test("tight window: gaps still respected when they fill the whole window", () => {
  const plan = planPieces({ ...base, windowSeconds: 120, random: () => 0.999 });
  assert.deepEqual(
    plan.map((piece) => piece.at - base.start),
    [0, 30, 60, 90, 120],
  );
});

test("rejects impossible plans", () => {
  assert.throws(() => planPieces({ ...base, amount: 20n * USDG }), /too small/);
  assert.throws(() => planPieces({ ...base, windowSeconds: 60 }), /window too short/);
  assert.throws(() => planPieces({ ...base, pieces: 0 }), /positive integer/);
});

test("one piece is the whole amount", () => {
  const [only] = planPieces({ ...base, pieces: 1 });
  assert.equal(only!.amount, base.amount);
});
