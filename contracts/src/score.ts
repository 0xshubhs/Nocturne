// defi1 — TS reference implementation of computeScore.
//
// MUST stay in lockstep with `circuit computeScore` in lending.compact.
// Parity-tested in contracts/test/score.parity.test.ts — if you change one,
// change both and re-run the parity suite.

import type { Attestation } from "./witnesses";

const ZERO32 = new Uint8Array(32);

function isZero(b: Uint8Array): boolean {
  return b.length === ZERO32.length && b.every((x) => x === 0);
}

const FIELD_WEIGHT: Record<string, bigint> = {
  "0": 2n, // bank balance band
  "1": 3n, // salary band
  "2": 4n, // repayment history
};

export function computeScore(
  attestations: Attestation[],
  crossChainScore: bigint,
  now: bigint,
): bigint {
  let score = 0n;
  for (const a of attestations) {
    if (isZero(a.issuer)) continue;
    if (a.expiry <= now) continue;
    const w = FIELD_WEIGHT[a.field.toString()] ?? 0n;
    score += a.value * w;
  }
  return score + crossChainScore;
}

// Tier table mirrors the constructor in lending.compact.
export const TIER_RULES = {
  0: { minScore: 500n, maxLtvBps: 8000n, aprBps: 900n },
  1: { minScore: 750n, maxLtvBps: 15000n, aprBps: 1400n },
} as const;

export function tierFor(score: bigint): 0 | 1 | null {
  if (score >= TIER_RULES[1].minScore) return 1;
  if (score >= TIER_RULES[0].minScore) return 0;
  return null;
}
