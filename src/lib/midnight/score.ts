// Nocturne — app-side mirror of the credit score and tier table.
//
// The authoritative copy is `contracts/src/score.ts`, which is parity-tested
// against the compiled `scoreOf` / `maxLoanTermSeconds` circuits
// (`contracts/test/score.parity.test.ts`). This file is a byte-for-byte mirror
// of the same arithmetic for the browser, kept separate because `contracts/` is
// a sibling workspace excluded from the app's tsconfig.
//
// If you change a weight or a tier rule, change it in three places — the
// circuit, contracts/src/score.ts, and here — and both parity suites will tell
// you if you missed one.
//
//   score = bank*2 + salary*3 + repay*4 + crossChain

export type Attestation = {
  value: bigint;
  /** Unix seconds. The circuit rejects the attestation once block time >= this. */
  expiry: bigint;
};

/** Every field the issuer mints a leaf for. Mirrors contracts/src/issuer.ts. */
export type AttestationField = "bank" | "salary" | "repay" | "crossChain";

export const ATTESTATION_FIELDS: readonly AttestationField[] = [
  "bank",
  "salary",
  "repay",
  "crossChain",
] as const;

/** The three an institution attests about the person, as opposed to a wallet. */
export const INSTITUTIONAL_FIELDS: readonly AttestationField[] = ["bank", "salary", "repay"] as const;

/** `score = bank*2 + salary*3 + repay*4 + crossChain`. */
export const WEIGHT: Record<AttestationField, bigint> = {
  bank: 2n,
  salary: 3n,
  repay: 4n,
  crossChain: 1n,
};

/** Human labels for the attestation inbox. */
export const FIELD_LABELS: Record<AttestationField, string> = {
  bank: "Bank balance band",
  salary: "Salary band",
  repay: "Repayment history",
  crossChain: "Cross-chain history",
};

/** Who mints each field, for the inbox's provenance column. */
export const FIELD_ISSUERS: Record<AttestationField, string> = {
  bank: "Bank",
  salary: "Payroll provider",
  repay: "Credit bureau",
  crossChain: "Cross-chain oracle",
};

export type TierId = 0 | 1;

export type TierRule = {
  minScore: bigint;
  maxLtvBps: bigint;
  aprBps: bigint;
};

/** Mirrors the constructor in lending.compact. */
export const TIER_RULES: Record<TierId, TierRule> = {
  0: { minScore: 500n, maxLtvBps: 5000n, aprBps: 900n },
  1: { minScore: 750n, maxLtvBps: 15000n, aprBps: 1400n },
};

/** Longest loan term the contract accepts, in seconds (90 days). */
export const MAX_LOAN_TERM_SECONDS = 7_776_000n;

const YEAR_SECONDS = 365n * 24n * 3600n;

function liveValue(a: Attestation | undefined, now: bigint): bigint {
  return a && a.expiry > now ? a.value : 0n;
}

export function computeScore(
  bank: Attestation | undefined,
  salary: Attestation | undefined,
  repay: Attestation | undefined,
  crossChainScore: bigint,
  now: bigint,
): bigint {
  return (
    liveValue(bank, now) * WEIGHT.bank +
    liveValue(salary, now) * WEIGHT.salary +
    liveValue(repay, now) * WEIGHT.repay +
    crossChainScore * WEIGHT.crossChain
  );
}

/** The attestation set a borrower holds locally. */
export type AttestationSet = Partial<Record<AttestationField, Attestation>>;

/**
 * Score a whole attestation set, applying the same expiry rule to the
 * cross-chain leaf as to the other three — a stale oracle attestation stops
 * counting, exactly as the circuit's `verifiedValue` requires.
 */
export function scoreFromSet(set: AttestationSet, now: bigint): bigint {
  return computeScore(set.bank, set.salary, set.repay, liveValue(set.crossChain, now), now);
}

/** Per-field contribution, for the score breakdown in the UI. */
export function scoreBreakdown(
  set: AttestationSet,
  now: bigint,
): Array<{ field: AttestationField; value: bigint; weight: bigint; points: bigint; expired: boolean }> {
  return ATTESTATION_FIELDS.map((field) => {
    const att = set[field];
    const expired = att !== undefined && att.expiry <= now;
    const value = liveValue(att, now);
    return { field, value, weight: WEIGHT[field], points: value * WEIGHT[field], expired };
  });
}

/** The highest tier a score unlocks, or null if it clears neither. */
export function tierFor(score: bigint): TierId | null {
  if (score >= TIER_RULES[1].minScore) return 1;
  if (score >= TIER_RULES[0].minScore) return 0;
  return null;
}

/** `amount / collateral <= maxLtvBps / 10000`, in integer arithmetic. */
export function withinLtv(amount: bigint, collateral: bigint, tier: TierId): boolean {
  return amount * 10000n <= collateral * TIER_RULES[tier].maxLtvBps;
}

/** Most that can be borrowed against `collateral` at `tier`. */
export function maxBorrow(collateral: bigint, tier: TierId): bigint {
  return (collateral * TIER_RULES[tier].maxLtvBps) / 10000n;
}

/** `borrow` requires `now < dueTime <= now + MAX_LOAN_TERM_SECONDS`. */
export function withinTerm(dueTime: bigint, now: bigint): boolean {
  return dueTime > now && dueTime <= now + MAX_LOAN_TERM_SECONDS;
}

/** Interest owed at maturity for a simple (non-compounding) APR. */
export function interestDue(principal: bigint, aprBps: bigint, termSeconds: bigint): bigint {
  return (principal * aprBps * termSeconds) / (10000n * YEAR_SECONDS);
}

/**
 * Progress toward the next tier, 0..1 — what the score band widget fills in.
 * At or past tier 1 it is 1.
 */
export function tierProgress(score: bigint): { next: TierId | null; fraction: number } {
  if (score >= TIER_RULES[1].minScore) return { next: null, fraction: 1 };
  const target = score >= TIER_RULES[0].minScore ? TIER_RULES[1] : TIER_RULES[0];
  const floor = score >= TIER_RULES[0].minScore ? TIER_RULES[0].minScore : 0n;
  const span = target.minScore - floor;
  const into = score - floor;
  return {
    next: score >= TIER_RULES[0].minScore ? 1 : 0,
    fraction: span === 0n ? 1 : Math.min(1, Number((into * 1000n) / span) / 1000),
  };
}

/**
 * The *band* a score falls in — the only thing a lender ever learns, and only
 * in aggregate. Never render a raw score anywhere a counterparty can see it.
 */
export function scoreBand(score: bigint): string {
  const tier = tierFor(score);
  if (tier === null) return `below ${TIER_RULES[0].minScore}`;
  if (tier === 0) return `${TIER_RULES[0].minScore}–${TIER_RULES[1].minScore - 1n}`;
  return `${TIER_RULES[1].minScore}+`;
}

export function formatBps(bps: bigint): string {
  return `${Number(bps) / 100}%`;
}
