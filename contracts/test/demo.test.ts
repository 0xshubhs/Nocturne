// Nocturne — the demo narrative as a regression test (plan.md §7).
//
// `npm run demo` prints this story; these cases assert it stays true. If a
// tier rule, weight or disclosure surface changes underneath the demo, this
// fails before the demo does.

import { describe, expect, it } from "vitest";
import { AttestationIssuer, DEMO_PERSONAS, toHex, type AttestationField } from "../src/issuer.js";
import { computeScore, TIER_RULES } from "../src/score.js";
import { borrowerState, LendingSim } from "../test/simulator.js";
import type { Attestation } from "../src/witnesses.js";

const ISSUER = new Uint8Array(32).fill(7);
const ALICE = new Uint8Array(32).fill(11);
const BOB = new Uint8Array(32).fill(22);

const NOW = 1_700_000_000;
const EXPIRY = BigInt(NOW + 365 * 24 * 3600);
const DUE = BigInt(NOW) + 30n * 24n * 3600n;

const COLLATERAL = 1000n;
const BOB_CROSS_CHAIN = DEMO_PERSONAS.bob.crossChain; // 120, minted by the oracle

const ALICE_MAX = (COLLATERAL * TIER_RULES[1].maxLtvBps) / 10000n; // 1500
const BOB_MAX = (COLLATERAL * TIER_RULES[0].maxLtvBps) / 10000n; //  500

function attsFor(v: Record<AttestationField, bigint>): Record<AttestationField, Attestation> {
  return {
    bank: { value: v.bank, expiry: EXPIRY },
    salary: { value: v.salary, expiry: EXPIRY },
    repay: { value: v.repay, expiry: EXPIRY },
    crossChain: { value: v.crossChain, expiry: EXPIRY },
  };
}

const ALICE_ATTS = attsFor(DEMO_PERSONAS.alice);
const BOB_ATTS = attsFor(DEMO_PERSONAS.bob);

/** The seeded world the demo script sets up in steps 1-2. */
async function seededPool() {
  const sim = await LendingSim.deploy(ISSUER);
  sim.setTime(NOW);
  await sim.depositLiquidity(1_000_000n);
  const issuer = new AttestationIssuer(ISSUER, (leaf) =>
    sim.issueAttestation(ISSUER, leaf).then(() => undefined),
  );
  await issuer.issuePersona("alice", ALICE, EXPIRY);
  await issuer.issuePersona("bob", BOB, EXPIRY);
  return sim;
}

describe("demo narrative", () => {
  it("issuing the two personas leaves eight opaque leaves and nothing else", async () => {
    const sim = await seededPool();
    expect(sim.ledger.attestationRoot.firstFree()).toBe(8n);
    expect(sim.ledger.loanCount).toBe(0n);
    expect([...sim.ledger.loans]).toHaveLength(0);
    expect([...sim.ledger.defaulters]).toHaveLength(0);
  });

  it("bob's cross-chain boost counts but does not reach tier 1", async () => {
    const sim = await seededPool();
    const bobScore = computeScore(BOB_ATTS.bank, BOB_ATTS.salary, BOB_ATTS.repay, BOB_CROSS_CHAIN, BigInt(NOW));
    const bobBase = computeScore(BOB_ATTS.bank, BOB_ATTS.salary, BOB_ATTS.repay, 0n, BigInt(NOW));

    expect(bobScore).toBe(bobBase + BOB_CROSS_CHAIN);
    expect(bobScore).toBeGreaterThanOrEqual(TIER_RULES[0].minScore);
    expect(bobScore).toBeLessThan(TIER_RULES[1].minScore);

    await expect(
      sim.borrow(borrowerState(BOB, BOB_ATTS), true, BOB_MAX, COLLATERAL, DUE),
    ).rejects.toThrow(/score below required tier/);
  });

  it("identical collateral, 3x borrow delta", async () => {
    const sim = await seededPool();
    await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, ALICE_MAX, COLLATERAL, DUE);
    await sim.borrow(borrowerState(BOB, BOB_ATTS), false, BOB_MAX, COLLATERAL, DUE);

    const alice = sim.ledger.loans.lookup(sim.nullifier(ALICE));
    const bob = sim.ledger.loans.lookup(sim.nullifier(BOB));

    expect(alice.collateral).toBe(bob.collateral);
    expect(alice.principal).toBe(bob.principal * 3n);
    expect(alice.tier).toBe(1n);
    expect(bob.tier).toBe(0n);
  });

  it("the public ledger carries no identity, score or attestation value", async () => {
    const sim = await seededPool();
    await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, ALICE_MAX, COLLATERAL, DUE);
    await sim.borrow(borrowerState(BOB, BOB_ATTS), false, BOB_MAX, COLLATERAL, DUE);

    // Everything the ledger holds about a loan, serialized.
    const published = JSON.stringify(
      [...sim.ledger.loans].map(([n, loan]) => ({
        nullifier: toHex(n),
        tier: loan.tier.toString(),
        principal: loan.principal.toString(),
        collateral: loan.collateral.toString(),
        dueTime: loan.dueTime.toString(),
        active: loan.active,
      })),
    );

    // No score, and no attestation value, appears anywhere in it.
    const aliceScore = computeScore(ALICE_ATTS.bank, ALICE_ATTS.salary, ALICE_ATTS.repay, 0n, BigInt(NOW));
    const bobScore = computeScore(BOB_ATTS.bank, BOB_ATTS.salary, BOB_ATTS.repay, BOB_CROSS_CHAIN, BigInt(NOW));
    expect(published).not.toContain(aliceScore.toString());
    expect(published).not.toContain(bobScore.toString());
    // Zero carries no information (and collides with tier "0"), so only the
    // values that actually say something about a borrower are checked.
    const secretValues = [...Object.values(DEMO_PERSONAS.alice), ...Object.values(DEMO_PERSONAS.bob)]
      .filter((v) => v !== 0n);
    for (const v of secretValues) expect(published).not.toContain(`"${v}"`);

    // A nullifier is not derivable back to the identity secret it came from.
    expect(toHex(sim.nullifier(ALICE))).not.toContain(toHex(ALICE));
    expect(toHex(sim.nullifier(ALICE))).not.toBe(toHex(sim.subjectId(ALICE)));
  });

  it("a repaid loan leaves no trace of the borrower", async () => {
    const sim = await seededPool();
    await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, ALICE_MAX, COLLATERAL, DUE);
    await sim.repay(borrowerState(ALICE, ALICE_ATTS), ALICE_MAX);

    expect(sim.ledger.loans.member(sim.nullifier(ALICE))).toBe(false);
    expect(sim.ledger.activeNullifiers.member(sim.nullifier(ALICE))).toBe(false);
    expect(sim.ledger.defaulters.member(sim.nullifier(ALICE))).toBe(false);
    // loanCount is a monotonic counter — it records that *a* loan happened.
    expect(sim.ledger.loanCount).toBe(1n);
  });

  it("default reveals exactly one nullifier, and it is bob's", async () => {
    const sim = await seededPool();
    await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, ALICE_MAX, COLLATERAL, DUE);
    await sim.borrow(borrowerState(BOB, BOB_ATTS), false, BOB_MAX, COLLATERAL, DUE);
    await sim.repay(borrowerState(ALICE, ALICE_ATTS), ALICE_MAX);

    // In term: refused.
    await expect(sim.liquidate(sim.nullifier(BOB))).rejects.toThrow(/not yet in default/);

    sim.setTime(Number(DUE) + 1);
    await sim.liquidate(sim.nullifier(BOB));

    const defaulters = [...sim.ledger.defaulters];
    expect(defaulters).toHaveLength(1);
    expect(sim.ledger.defaulters.member(sim.nullifier(BOB))).toBe(true);
    expect(sim.ledger.defaulters.member(sim.nullifier(ALICE))).toBe(false);
    expect(defaulters[0]).toHaveLength(32);
  });

  it("the pool ends whole: alice repaid, bob's collateral was seized", async () => {
    const sim = await seededPool();
    const start = sim.ledger.poolLiquidity;

    await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, ALICE_MAX, COLLATERAL, DUE);
    await sim.borrow(borrowerState(BOB, BOB_ATTS), false, BOB_MAX, COLLATERAL, DUE);
    expect(sim.ledger.poolLiquidity).toBe(start - ALICE_MAX - BOB_MAX);

    await sim.repay(borrowerState(ALICE, ALICE_ATTS), ALICE_MAX);
    sim.setTime(Number(DUE) + 1);
    await sim.liquidate(sim.nullifier(BOB));

    // Bob's 500 principal is gone, but his 1000 collateral came in.
    expect(sim.ledger.poolLiquidity).toBe(start - BOB_MAX + COLLATERAL);
    expect(sim.ledger.poolLiquidity).toBeGreaterThan(start);
  });
});
