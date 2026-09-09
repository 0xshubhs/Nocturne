// Nocturne — the app's mirror of the scoring rules.
//
// The fixtures below are deliberately the same ones
// `contracts/test/score.parity.test.ts` runs against the compiled circuit. That
// suite proves `contracts/src/score.ts` == the circuit; this one proves the
// browser copy agrees with the same numbers. Change a weight in one place and
// exactly one of the two suites goes red.

import { describe, expect, it } from "vitest";
import {
  computeScore,
  formatBps,
  interestDue,
  maxBorrow,
  MAX_LOAN_TERM_SECONDS,
  scoreBand,
  scoreBreakdown,
  scoreFromSet,
  tierFor,
  tierProgress,
  TIER_RULES,
  withinLtv,
  withinTerm,
  type Attestation,
} from "./score";

const now = 1_000_000n;
const future = { expiry: now + 10_000n };

const personas = {
  // 200*2 + 150*3 + 90*4 + 0 = 1210
  alice: {
    bank: { value: 200n, ...future },
    salary: { value: 150n, ...future },
    repay: { value: 90n, ...future },
    cross: 0n,
  },
  // 100*2 + 80*3 + 15*4 + 120 = 620
  bob: {
    bank: { value: 100n, ...future },
    salary: { value: 80n, ...future },
    repay: { value: 15n, ...future },
    cross: 120n,
  },
  zero: { bank: undefined, salary: undefined, repay: undefined, cross: 0n },
  expired: {
    bank: { value: 999n, expiry: now - 1n } as Attestation,
    salary: undefined,
    repay: undefined,
    cross: 0n,
  },
} as const;

describe("computeScore", () => {
  it("matches the documented weights for each persona", () => {
    expect(computeScore(personas.alice.bank, personas.alice.salary, personas.alice.repay, personas.alice.cross, now)).toBe(1210n);
    expect(computeScore(personas.bob.bank, personas.bob.salary, personas.bob.repay, personas.bob.cross, now)).toBe(620n);
    expect(computeScore(undefined, undefined, undefined, 0n, now)).toBe(0n);
  });

  it("drops an expired attestation to zero", () => {
    expect(computeScore(personas.expired.bank, undefined, undefined, 0n, now)).toBe(0n);
    // one second before expiry it still counts
    expect(computeScore({ value: 999n, expiry: now + 1n }, undefined, undefined, 0n, now)).toBe(1998n);
  });

  it("treats expiry as exclusive, exactly as the circuit does", () => {
    expect(computeScore({ value: 10n, expiry: now }, undefined, undefined, 0n, now)).toBe(0n);
  });
});

describe("scoreFromSet", () => {
  it("agrees with the positional form", () => {
    const set = { bank: personas.bob.bank, salary: personas.bob.salary, repay: personas.bob.repay, crossChain: { value: 120n, ...future } };
    expect(scoreFromSet(set, now)).toBe(620n);
  });

  it("expires the cross-chain leaf like any other", () => {
    const set = {
      bank: personas.bob.bank,
      salary: personas.bob.salary,
      repay: personas.bob.repay,
      crossChain: { value: 120n, expiry: now - 1n },
    };
    expect(scoreFromSet(set, now)).toBe(500n);
  });

  it("breaks the score down into contributions that sum to it", () => {
    const set = { bank: personas.alice.bank, salary: personas.alice.salary, repay: personas.alice.repay };
    const rows = scoreBreakdown(set, now);
    expect(rows.reduce((acc, r) => acc + r.points, 0n)).toBe(scoreFromSet(set, now));
    expect(rows.find((r) => r.field === "crossChain")?.points).toBe(0n);
  });

  it("flags an expired field in the breakdown", () => {
    const rows = scoreBreakdown({ bank: { value: 999n, expiry: now - 1n } }, now);
    const bank = rows.find((r) => r.field === "bank")!;
    expect(bank.expired).toBe(true);
    expect(bank.points).toBe(0n);
  });
});

describe("tiers", () => {
  it("alice reaches tier 1, bob only tier 0", () => {
    expect(tierFor(1210n)).toBe(1);
    expect(tierFor(620n)).toBe(0);
    expect(tierFor(499n)).toBe(null);
  });

  it("thresholds are inclusive", () => {
    expect(tierFor(TIER_RULES[0].minScore)).toBe(0);
    expect(tierFor(TIER_RULES[0].minScore - 1n)).toBe(null);
    expect(tierFor(TIER_RULES[1].minScore)).toBe(1);
    expect(tierFor(TIER_RULES[1].minScore - 1n)).toBe(0);
  });

  it("reports a band, never the raw score", () => {
    expect(scoreBand(1210n)).toBe("750+");
    expect(scoreBand(620n)).toBe("500–749");
    expect(scoreBand(10n)).toBe("below 500");
    expect(scoreBand(1210n)).not.toContain("1210");
  });

  it("tracks progress toward the next threshold", () => {
    expect(tierProgress(1210n)).toEqual({ next: null, fraction: 1 });
    expect(tierProgress(0n).next).toBe(0);
    expect(tierProgress(250n).fraction).toBeCloseTo(0.5, 2);
    // bob at 620 is 120/250 of the way from tier 0 to tier 1
    const bob = tierProgress(620n);
    expect(bob.next).toBe(1);
    expect(bob.fraction).toBeCloseTo(0.48, 2);
  });
});

describe("LTV", () => {
  it("boundary is inclusive at both tiers", () => {
    expect(withinLtv(500n, 1000n, 0)).toBe(true);
    expect(withinLtv(501n, 1000n, 0)).toBe(false);
    expect(withinLtv(1500n, 1000n, 1)).toBe(true);
    expect(withinLtv(1501n, 1000n, 1)).toBe(false);
  });

  it("maxBorrow is the largest amount withinLtv accepts", () => {
    for (const tier of [0, 1] as const) {
      const cap = maxBorrow(1000n, tier);
      expect(withinLtv(cap, 1000n, tier)).toBe(true);
      expect(withinLtv(cap + 1n, 1000n, tier)).toBe(false);
    }
  });

  it("the tier spread is exactly 3x — the demo's headline claim", () => {
    expect(maxBorrow(1000n, 1)).toBe(maxBorrow(1000n, 0) * 3n);
  });
});

describe("term", () => {
  it("accepts a due time inside the window and rejects the edges", () => {
    expect(withinTerm(now, now)).toBe(false);
    expect(withinTerm(now + 1n, now)).toBe(true);
    expect(withinTerm(now + MAX_LOAN_TERM_SECONDS, now)).toBe(true);
    expect(withinTerm(now + MAX_LOAN_TERM_SECONDS + 1n, now)).toBe(false);
  });

  it("the cap is 90 days", () => {
    expect(MAX_LOAN_TERM_SECONDS).toBe(90n * 24n * 3600n);
  });
});

describe("interest", () => {
  it("charges a full year of APR over a full year", () => {
    const year = 365n * 24n * 3600n;
    expect(interestDue(1000n, TIER_RULES[0].aprBps, year)).toBe(90n);
    expect(interestDue(1000n, TIER_RULES[1].aprBps, year)).toBe(140n);
  });

  it("pro-rates a partial term and floors the remainder", () => {
    const year = 365n * 24n * 3600n;
    expect(interestDue(1000n, 900n, year / 2n)).toBe(45n);
    expect(interestDue(1n, 900n, 1n)).toBe(0n);
  });
});

describe("formatting", () => {
  it("renders basis points as percentages", () => {
    expect(formatBps(900n)).toBe("9%");
    expect(formatBps(1400n)).toBe("14%");
    expect(formatBps(5000n)).toBe("50%");
    expect(formatBps(15000n)).toBe("150%");
  });
});
