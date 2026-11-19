// Splits one order into pieces of random size at random times inside a window.
// Pure: randomness is injected, so plans are reproducible in tests.

export interface PlanInput {
  /** Total USDG to route, in token units (6 decimals). */
  amount: bigint;
  pieces: number;
  /** Window length in seconds; piece times fall inside [start, start + windowSeconds]. */
  windowSeconds: number;
  /** Unix seconds of the window start. */
  start: number;
  /** Smallest allowed piece, in token units. */
  minPiece: bigint;
  /** Smallest gap between two pieces, in seconds. */
  minGapSeconds: number;
  /** Uniform random number in [0, 1). Defaults to a cryptographic source. */
  random?: () => number;
}

export interface PlannedPiece {
  number: number;
  amount: bigint;
  /** Unix seconds. */
  at: number;
}

/** Cryptographically random float in [0, 1). */
export function secureRandom(): number {
  const word = new Uint32Array(1);
  crypto.getRandomValues(word);
  return word[0]! / 2 ** 32;
}

/**
 * Piece sizes: each piece gets the minimum, and the rest is shared out by random weights in
 * [0.5, 1.5), so sizes vary by up to about 3x but none is tiny. Rounded to whole cents; the last
 * piece takes the rounding remainder so the total is exact.
 * Times: random points in the window, sorted, then pushed apart to respect the minimum gap.
 */
export function planPieces(input: PlanInput): PlannedPiece[] {
  const { amount, pieces, windowSeconds, start, minPiece, minGapSeconds } = input;
  const random = input.random ?? secureRandom;
  if (!Number.isInteger(pieces) || pieces < 1) throw new Error("pieces must be a positive integer");
  if (amount < minPiece * BigInt(pieces)) throw new Error("amount too small for that many pieces");
  if (minGapSeconds * (pieces - 1) > windowSeconds) throw new Error("window too short for the minimum gap");

  const CENT = 10_000n; // 0.01 USDG in 6-decimal units
  const spare = amount - minPiece * BigInt(pieces);
  const weights = Array.from({ length: pieces }, () => 0.5 + random());
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  const amounts: bigint[] = [];
  let assigned = 0n;
  for (let i = 0; i < pieces - 1; i++) {
    const share = (spare * BigInt(Math.floor((weights[i]! / weightTotal) * 1e9))) / 1_000_000_000n;
    const rounded = (share / CENT) * CENT;
    amounts.push(minPiece + rounded);
    assigned += rounded;
  }
  amounts.push(minPiece + spare - assigned);

  // Times: sort random offsets, then enforce the gap; if pushing runs past the window, pull back.
  const offsets = Array.from({ length: pieces }, () => Math.floor(random() * (windowSeconds + 1))).sort((a, b) => a - b);
  for (let i = 1; i < pieces; i++) offsets[i] = Math.max(offsets[i]!, offsets[i - 1]! + minGapSeconds);
  const overflow = offsets[pieces - 1]! - windowSeconds;
  if (overflow > 0) {
    for (let i = pieces - 1; i >= 0; i--) {
      const latest = i === pieces - 1 ? windowSeconds : offsets[i + 1]! - minGapSeconds;
      offsets[i] = Math.min(offsets[i]!, latest);
    }
  }

  return amounts.map((pieceAmount, i) => ({ number: i, amount: pieceAmount, at: start + offsets[i]! }));
}
