// defi1 — TS reference for the credit score.
//
// MUST stay in lockstep with the score arithmetic in `borrow` (lending.compact):
//   score = bank*2 + salary*3 + repay*4 + crossChain
// Parity-tested in contracts/test/score.parity.test.ts.

import type { Attestation } from "./witnesses";

const WEIGHT = { bank: 2n, salary: 3n, repay: 4n } as const;

export function computeScore(
  bank: Attestation | undefined,
  salary: Attestation | undefined,
  repay: Attestation | undefined,
  crossChainScore: bigint,
  now: bigint,
): bigint {
  const v = (a: Attestation | undefined): bigint =>
    a && a.expiry > now ? a.value : 0n;
  return (
    v(bank) * WEIGHT.bank +
    v(salary) * WEIGHT.salary +
    v(repay) * WEIGHT.repay +
    crossChainScore
  );
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

// amount / collateral <= maxLtvBps / 10000
export function withinLtv(amount: bigint, collateral: bigint, tier: 0 | 1): boolean {
  return amount * 10000n <= collateral * TIER_RULES[tier].maxLtvBps;
}
