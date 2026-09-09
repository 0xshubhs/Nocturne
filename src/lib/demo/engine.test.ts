// Nocturne — the browser demo ledger.
//
// The authority on contract behaviour is `contracts/test/lending.test.ts`,
// which runs the compiled circuits. These cases pin the browser twin to the
// same rules, so a UI that looks right is not quietly disagreeing with the
// chain about what would be accepted.

import { describe, expect, it } from "vitest";
import {
  attestationLeaf,
  demo,
  DemoError,
  emptyLedger,
  isInDefault,
  liquidationRisk,
  loanFor,
  nullifierFor,
  subjectIdFor,
  totalOutstanding,
  wasLiquidated,
  type DemoLedger,
} from "./engine";
import { DEMO_COLLATERAL, initialAttestations, PERSONAS, SEED_LIQUIDITY } from "./personas";
import { MAX_LOAN_TERM_SECONDS, maxBorrow, scoreFromSet } from "@/lib/midnight/score";

const NOW = 1_700_000_000n;
const DUE = NOW + 30n * 24n * 3600n;

const ALICE = PERSONAS.alice;
const BOB = PERSONAS.bob;

const aliceAtts = initialAttestations(ALICE, NOW);
const bobAtts = initialAttestations(BOB, NOW);

/** Seeded pool with both personas onboarded — the demo's starting state. */
function seeded(): DemoLedger {
  let l = emptyLedger(NOW);
  l = demo.depositLiquidity(l, SEED_LIQUIDITY);
  l = demo.issueSet(l, ALICE.secret, aliceAtts);
  l = demo.issueSet(l, BOB.secret, bobAtts);
  return l;
}

function borrowAt(l: DemoLedger, persona: typeof ALICE, atts = aliceAtts, tier: 0 | 1 = 1, amount = 1500n) {
  return demo.borrow(l, {
    secret: persona.secret,
    attestations: atts,
    tier,
    amount,
    collateral: DEMO_COLLATERAL,
    dueTime: DUE,
  });
}

describe("identity derivation", () => {
  it("is deterministic and domain-separated", () => {
    expect(nullifierFor(ALICE.secret)).toBe(nullifierFor(ALICE.secret));
    expect(nullifierFor(ALICE.secret)).not.toBe(nullifierFor(BOB.secret));
    // A nullifier and a subject id for the same secret must not be the same
    // value, or an attestation would be linkable to a loan.
    expect(nullifierFor(ALICE.secret)).not.toBe(subjectIdFor(ALICE.secret));
  });

  it("leaves bind field, subject, value and expiry", () => {
    const subject = subjectIdFor(ALICE.secret);
    const base = attestationLeaf("bank", { value: 200n, expiry: 100n }, subject);
    expect(attestationLeaf("bank", { value: 200n, expiry: 100n }, subject)).toBe(base);
    expect(attestationLeaf("salary", { value: 200n, expiry: 100n }, subject)).not.toBe(base);
    expect(attestationLeaf("bank", { value: 201n, expiry: 100n }, subject)).not.toBe(base);
    expect(attestationLeaf("bank", { value: 200n, expiry: 101n }, subject)).not.toBe(base);
    expect(attestationLeaf("bank", { value: 200n, expiry: 100n }, subjectIdFor(BOB.secret))).not.toBe(base);
  });
});

describe("onboarding", () => {
  it("publishes four opaque leaves per persona", () => {
    const l = seeded();
    expect(l.attestationLeaves).toHaveLength(8);
    for (const leaf of l.attestationLeaves) expect(leaf).toMatch(/^[0-9a-f]{64}$/);
  });

  it("issuing the same leaf twice is a no-op", () => {
    let l = seeded();
    const before = l.attestationLeaves.length;
    l = demo.issueSet(l, ALICE.secret, aliceAtts);
    expect(l.attestationLeaves).toHaveLength(before);
  });
});

describe("borrow", () => {
  it("lets alice into tier 1 and bob only into tier 0", () => {
    expect(scoreFromSet(aliceAtts, NOW)).toBe(1210n);
    expect(scoreFromSet(bobAtts, NOW)).toBe(500n);

    const l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    expect(loanFor(l, ALICE.secret)?.tier).toBe(1);

    expect(() => borrowAt(seeded(), BOB, bobAtts, 1, 1500n)).toThrow(/score below required tier/);
  });

  it("enforces the LTV cap at each tier", () => {
    expect(() => borrowAt(seeded(), ALICE, aliceAtts, 1, maxBorrow(DEMO_COLLATERAL, 1) + 1n)).toThrow(
      /exceeds max LTV/,
    );
    expect(() => borrowAt(seeded(), BOB, bobAtts, 0, maxBorrow(DEMO_COLLATERAL, 0) + 1n)).toThrow(
      /exceeds max LTV/,
    );
    // exactly at the cap is fine
    expect(() => borrowAt(seeded(), BOB, bobAtts, 0, maxBorrow(DEMO_COLLATERAL, 0))).not.toThrow();
  });

  it("blocks a second active loan for the same identity", () => {
    const l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1000n);
    expect(() => borrowAt(l, ALICE, aliceAtts, 1, 100n)).toThrow(/already has an active loan/);
  });

  it("rejects an attestation the issuer never published", () => {
    const forged = { ...bobAtts, bank: { value: 999n, expiry: bobAtts.bank!.expiry } };
    expect(() => borrowAt(seeded(), BOB, forged, 0, 100n)).toThrow(/not issued by the issuer/);
  });

  it("rejects a self-asserted cross-chain score", () => {
    const forged = { ...bobAtts, crossChain: { value: 300n, expiry: bobAtts.crossChain!.expiry } };
    expect(() => borrowAt(seeded(), BOB, forged, 1, 100n)).toThrow(/not issued by the issuer/);
  });

  it("rejects an expired attestation", () => {
    let l = seeded();
    const stale = { ...bobAtts, bank: { value: 100n, expiry: NOW - 1n } };
    l = demo.issueSet(l, BOB.secret, stale);
    expect(() => borrowAt(l, BOB, stale, 0, 100n)).toThrow(/attestation expired/);
  });

  it("enforces the term window at both ends", () => {
    const l = seeded();
    const call = (dueTime: bigint) =>
      demo.borrow(l, {
        secret: ALICE.secret,
        attestations: aliceAtts,
        tier: 1,
        amount: 1000n,
        collateral: DEMO_COLLATERAL,
        dueTime,
      });
    expect(() => call(NOW)).toThrow(/due time must be in the future/);
    expect(() => call(NOW + MAX_LOAN_TERM_SECONDS + 1n)).toThrow(/loan term exceeds the maximum/);
    expect(() => call(NOW + MAX_LOAN_TERM_SECONDS)).not.toThrow();
  });

  it("rejects a borrow larger than the pool", () => {
    let l = seeded();
    l = demo.withdrawLiquidity(l, SEED_LIQUIDITY - 100n);
    expect(() => borrowAt(l, ALICE, aliceAtts, 1, 1500n)).toThrow(/insufficient pool liquidity/);
  });

  it("moves liquidity out of the pool and counts the loan", () => {
    const l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    expect(l.poolLiquidity).toBe(SEED_LIQUIDITY - 1500n);
    expect(l.loanCount).toBe(1);
    expect(totalOutstanding(l)).toBe(1500n);
  });
});

describe("the 3x demo", () => {
  it("identical collateral, alice borrows three times bob's amount", () => {
    let l = seeded();
    l = borrowAt(l, ALICE, aliceAtts, 1, maxBorrow(DEMO_COLLATERAL, 1));
    l = borrowAt(l, BOB, bobAtts, 0, maxBorrow(DEMO_COLLATERAL, 0));

    const alice = loanFor(l, ALICE.secret)!;
    const bob = loanFor(l, BOB.secret)!;
    expect(alice.collateral).toBe(bob.collateral);
    expect(alice.principal).toBe(bob.principal * 3n);
  });
});

describe("repay", () => {
  it("frees the identity and returns the principal", () => {
    let l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    l = demo.repay(l, ALICE.secret, 1500n);
    expect(loanFor(l, ALICE.secret)).toBeNull();
    expect(l.poolLiquidity).toBe(SEED_LIQUIDITY);
    // the counter still records that a loan happened
    expect(l.loanCount).toBe(1);
  });

  it("refuses a partial repayment and a repayment with no loan", () => {
    const l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    expect(() => demo.repay(l, ALICE.secret, 1499n)).toThrow(/below principal/);
    expect(() => demo.repay(l, BOB.secret, 100n)).toThrow(/no active loan/);
  });

  it("lets the same identity borrow again afterwards", () => {
    let l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    l = demo.repay(l, ALICE.secret, 1500n);
    expect(() => borrowAt(l, ALICE, aliceAtts, 1, 500n)).not.toThrow();
  });
});

describe("liquidate", () => {
  it("is refused while the loan is in term", () => {
    const l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    expect(() => demo.liquidate(l, nullifierFor(ALICE.secret))).toThrow(/not yet in default/);
    expect(isInDefault(l, ALICE.secret)).toBe(false);
  });

  it("reveals exactly one nullifier once the loan is past due", () => {
    let l = seeded();
    l = borrowAt(l, ALICE, aliceAtts, 1, maxBorrow(DEMO_COLLATERAL, 1));
    l = borrowAt(l, BOB, bobAtts, 0, maxBorrow(DEMO_COLLATERAL, 0));
    l = demo.repay(l, ALICE.secret, maxBorrow(DEMO_COLLATERAL, 1));

    l = demo.advanceTime(l, 31n * 24n * 3600n);
    expect(isInDefault(l, BOB.secret)).toBe(true);
    l = demo.liquidate(l, nullifierFor(BOB.secret));

    expect(l.defaulters).toEqual([nullifierFor(BOB.secret)]);
    expect(wasLiquidated(l, BOB.secret)).toBe(true);
    expect(wasLiquidated(l, ALICE.secret)).toBe(false);
    expect(loanFor(l, BOB.secret)).toBeNull();
  });

  it("seizes the collateral into the pool", () => {
    let l = borrowAt(seeded(), BOB, bobAtts, 0, 500n);
    l = demo.advanceTime(l, 31n * 24n * 3600n);
    l = demo.liquidate(l, nullifierFor(BOB.secret));
    expect(l.poolLiquidity).toBe(SEED_LIQUIDITY - 500n + DEMO_COLLATERAL);
  });

  it("cannot be repeated on a closed loan", () => {
    let l = borrowAt(seeded(), BOB, bobAtts, 0, 500n);
    l = demo.advanceTime(l, 31n * 24n * 3600n);
    l = demo.liquidate(l, nullifierFor(BOB.secret));
    expect(() => demo.liquidate(l, nullifierFor(BOB.secret))).toThrow(/no active loan/);
  });
});

describe("liquidity guards", () => {
  it("refuses a withdrawal beyond the pool", () => {
    const l = seeded();
    expect(() => demo.withdrawLiquidity(l, SEED_LIQUIDITY + 1n)).toThrow(/insufficient pool liquidity/);
  });

  it("refuses a non-positive deposit", () => {
    expect(() => demo.depositLiquidity(emptyLedger(NOW), 0n)).toThrow(DemoError);
  });
});

describe("risk meter", () => {
  it("runs from 0 at origination to 1 at maturity", () => {
    let l = borrowAt(seeded(), ALICE, aliceAtts, 1, 1500n);
    const loan = loanFor(l, ALICE.secret)!;
    expect(liquidationRisk(l, loan, NOW)).toBe(0);

    l = demo.advanceTime(l, 15n * 24n * 3600n);
    expect(liquidationRisk(l, loan, NOW)).toBeCloseTo(0.5, 1);

    l = demo.advanceTime(l, 30n * 24n * 3600n);
    expect(liquidationRisk(l, loan, NOW)).toBe(1);
  });
});

describe("state is immutable", () => {
  it("never mutates the ledger it was handed", () => {
    const before = seeded();
    const snapshot = JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    borrowAt(before, ALICE, aliceAtts, 1, 1500n);
    expect(JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toBe(snapshot);
  });
});
