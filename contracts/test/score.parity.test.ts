// Parity: the TS score reference (score.ts) must match the compiled circuit
// (`scoreOf` pure circuit) for every fixture.

import { describe, expect, it } from "vitest";
import { pureCircuits } from "../src/managed/lending/contract/index.js";
import {
  computeScore,
  interestDue,
  MAX_LOAN_TERM_SECONDS,
  tierFor,
  TIER_RULES,
  withinLtv,
  withinTerm,
} from "../src/score.js";

const now = 1_000_000n;
const future = { expiry: now + 10_000n };

const personas = {
  alice: { bank: { value: 200n, ...future }, salary: { value: 150n, ...future }, repay: { value: 90n, ...future }, cross: 40n },
  bob: { bank: { value: 100n, ...future }, salary: { value: 80n, ...future }, repay: { value: 15n, ...future }, cross: 0n },
  zero: { bank: undefined, salary: undefined, repay: undefined, cross: 0n },
  expired: { bank: { value: 999n, expiry: now - 1n }, salary: undefined, repay: undefined, cross: 0n },
} as const;

describe("score.ts <-> scoreOf circuit parity", () => {
  for (const [name, p] of Object.entries(personas)) {
    it(name, () => {
      const ts = computeScore(p.bank, p.salary, p.repay, p.cross, now);
      // the circuit has no notion of expiry — it's checked separately in borrow —
      // so feed it the values the witness would forward for non-expired slots.
      const v = (a?: { value: bigint; expiry: bigint }) => (a && a.expiry > now ? a.value : 0n);
      const circuit = pureCircuits.scoreOf(v(p.bank), v(p.salary), v(p.repay), p.cross);
      expect(ts).toBe(circuit);
    });
  }
});

describe("tier + LTV helpers", () => {
  it("alice reaches tier 1, bob only tier 0", () => {
    const alice = computeScore(personas.alice.bank, personas.alice.salary, personas.alice.repay, personas.alice.cross, now);
    const bob = computeScore(personas.bob.bank, personas.bob.salary, personas.bob.repay, personas.bob.cross, now);
    expect(alice).toBeGreaterThanOrEqual(TIER_RULES[1].minScore);
    expect(tierFor(alice)).toBe(1);
    expect(bob).toBeGreaterThanOrEqual(TIER_RULES[0].minScore);
    expect(bob).toBeLessThan(TIER_RULES[1].minScore);
    expect(tierFor(bob)).toBe(0);
  });

  it("LTV boundary is inclusive", () => {
    // tier 0 maxLtvBps = 5000 -> 50%. 500 against 1000 collateral is exactly at the cap.
    expect(withinLtv(500n, 1000n, 0)).toBe(true);
    expect(withinLtv(501n, 1000n, 0)).toBe(false);
    // tier 1 allows 150%
    expect(withinLtv(1500n, 1000n, 1)).toBe(true);
    expect(withinLtv(1501n, 1000n, 1)).toBe(false);
  });
});

describe("loan term cap", () => {
  it("score.ts mirrors the circuit's maxLoanTermSeconds()", () => {
    expect(MAX_LOAN_TERM_SECONDS).toBe(pureCircuits.maxLoanTermSeconds());
  });

  it("withinTerm brackets the window the circuit enforces", () => {
    const now = 1_000_000n;
    expect(withinTerm(now, now)).toBe(false); // must be in the future
    expect(withinTerm(now + 1n, now)).toBe(true);
    expect(withinTerm(now + MAX_LOAN_TERM_SECONDS, now)).toBe(true);
    expect(withinTerm(now + MAX_LOAN_TERM_SECONDS + 1n, now)).toBe(false);
  });
});

describe("interestDue", () => {
  it("charges a full year of APR over a full year", () => {
    const year = 365n * 24n * 3600n;
    // tier 0 is 900bps = 9% -> 90 on a principal of 1000
    expect(interestDue(1000n, TIER_RULES[0].aprBps, year)).toBe(90n);
    // tier 1 is 1400bps = 14%
    expect(interestDue(1000n, TIER_RULES[1].aprBps, year)).toBe(140n);
  });

  it("pro-rates a partial term and floors the remainder", () => {
    const year = 365n * 24n * 3600n;
    expect(interestDue(1000n, 900n, year / 2n)).toBe(45n);
    expect(interestDue(1n, 900n, 1n)).toBe(0n);
  });
});
