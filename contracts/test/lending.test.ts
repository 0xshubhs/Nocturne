// defi1 — core contract behaviour, run against the in-memory simulator
// (no proof server). Covers the milestone-1 checklist: score thresholds,
// LTV boundary, double-borrow rejection, and the liquidation disclosure surface.

import { beforeEach, describe, expect, it } from "vitest";
import { borrowerState, LendingSim } from "./simulator.js";
import type { Attestation } from "../src/witnesses.js";

const ISSUER = new Uint8Array(32).fill(7);
const ALICE = new Uint8Array(32).fill(11); // strong private score
const BOB = new Uint8Array(32).fill(22); // thin file

const NOW = 1_000_000;
const DUE = 1_500_000n;

const att = (value: bigint, expiry = 9_000_000n): Attestation => ({ value, expiry });

// alice: 200*2 + 150*3 + 90*4 + 0 = 1210  -> tier 1 (>= 750)
const ALICE_ATTS = { bank: att(200n), salary: att(150n), repay: att(90n) };
// bob: 100*2 + 80*3 + 15*4 + 0 = 500  -> tier 0 only (>= 500, < 750)
const BOB_ATTS = { bank: att(100n), salary: att(80n), repay: att(15n) };

describe("defi1 lending core", () => {
  let sim: LendingSim;

  beforeEach(async () => {
    sim = await LendingSim.deploy(ISSUER);
    sim.setTime(NOW);
    await sim.depositLiquidity(1_000_000n);
    await sim.issueFor(ISSUER, ALICE, ALICE_ATTS);
    await sim.issueFor(ISSUER, BOB, BOB_ATTS);
  });

  describe("score thresholds", () => {
    it("lets a strong borrower into tier 1", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);
      const loan = sim.ledger.loans.lookup(sim.nullifier(ALICE));
      expect(loan.tier).toBe(1n);
      expect(loan.principal).toBe(1000n);
    });

    it("rejects a thin-file borrower from tier 1", async () => {
      const ps = borrowerState(BOB, BOB_ATTS);
      await expect(sim.borrow(ps, true, 500n, 1000n, DUE)).rejects.toThrow(/score below required tier/);
    });

    it("lets the same thin-file borrower into tier 0", async () => {
      const ps = borrowerState(BOB, BOB_ATTS);
      await sim.borrow(ps, false, 500n, 1000n, DUE);
      expect(sim.ledger.loans.lookup(sim.nullifier(BOB)).tier).toBe(0n);
    });

    it("counts an issued cross-chain contribution toward the threshold", async () => {
      // bob at 500 + 300 cross-chain = 800 -> clears tier 1, but only because
      // the issuer minted the leaf. The borrower cannot mint it himself.
      const dave = new Uint8Array(32).fill(44);
      const withCross = { ...BOB_ATTS, crossChain: att(300n) };
      await sim.issueFor(ISSUER, dave, withCross);
      await sim.borrow(borrowerState(dave, withCross), true, 500n, 1000n, DUE);
      expect(sim.ledger.loans.lookup(sim.nullifier(dave)).tier).toBe(1n);
    });

    it("a self-asserted cross-chain score the issuer never minted is rejected", async () => {
      // Same borrower, same everything, except he claims 300 cross-chain
      // points that no leaf backs. The witness cannot produce a Merkle path.
      const forged = { ...BOB_ATTS, crossChain: att(300n) };
      await expect(sim.borrow(borrowerState(BOB, forged), true, 500n, 1000n, DUE)).rejects.toThrow(
        /attestation leaf not found/,
      );
    });

    it("rejects an expired attestation", async () => {
      const stale = { ...ALICE_ATTS, bank: att(200n, BigInt(NOW - 1)) };
      const carol = new Uint8Array(32).fill(33);
      await sim.issueFor(ISSUER, carol, stale);
      const ps = borrowerState(carol, stale);
      await expect(sim.borrow(ps, false, 100n, 1000n, DUE)).rejects.toThrow(/expired/);
    });
  });

  describe("LTV boundary", () => {
    it("accepts a loan exactly at the tier-0 cap (50%)", async () => {
      const ps = borrowerState(BOB, BOB_ATTS);
      await sim.borrow(ps, false, 500n, 1000n, DUE);
      expect(sim.ledger.loans.lookup(sim.nullifier(BOB)).principal).toBe(500n);
    });

    it("rejects one unit over the tier-0 cap", async () => {
      const ps = borrowerState(BOB, BOB_ATTS);
      await expect(sim.borrow(ps, false, 501n, 1000n, DUE)).rejects.toThrow(/max LTV/);
    });

    it("allows the higher tier-1 cap (150%)", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1500n, 1000n, DUE);
      expect(sim.ledger.loans.lookup(sim.nullifier(ALICE)).principal).toBe(1500n);
    });

    it("the tier spread is exactly 3x on identical collateral", async () => {
      const collateral = 1000n;
      await sim.borrow(borrowerState(ALICE, ALICE_ATTS), true, 1500n, collateral, DUE);
      await sim.borrow(borrowerState(BOB, BOB_ATTS), false, 500n, collateral, DUE);
      const alice = sim.ledger.loans.lookup(sim.nullifier(ALICE)).principal;
      const bob = sim.ledger.loans.lookup(sim.nullifier(BOB)).principal;
      expect(alice).toBe(bob * 3n);
    });
  });

  describe("double-borrow rejection", () => {
    it("blocks a second active loan for the same identity", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);
      await expect(sim.borrow(ps, true, 500n, 1000n, DUE)).rejects.toThrow(/already has an active loan/);
    });

    it("allows a fresh loan once the first is repaid", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);
      await sim.repay(ps, 1000n);
      expect(sim.ledger.activeNullifiers.member(sim.nullifier(ALICE))).toBe(false);
      await sim.borrow(ps, true, 500n, 1000n, DUE);
      expect(sim.ledger.activeNullifiers.member(sim.nullifier(ALICE))).toBe(true);
    });
  });

  describe("liquidation disclosure surface", () => {
    it("cannot liquidate before the due time", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);
      await expect(sim.liquidate(sim.nullifier(ALICE))).rejects.toThrow(/not yet in default/);
    });

    it("after default, reveals only the defaulter nullifier and nothing else", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);

      sim.setTime(Number(DUE) + 1);
      await sim.liquidate(sim.nullifier(ALICE));

      const nul = sim.nullifier(ALICE);
      // the one thing disclosed: the defaulter's nullifier
      expect(sim.ledger.defaulters.member(nul)).toBe(true);
      expect([...sim.ledger.defaulters]).toHaveLength(1);

      // loan closed, collateral seized into the pool, identity slot freed
      expect(sim.ledger.loans.member(nul)).toBe(false);
      expect(sim.ledger.activeNullifiers.member(nul)).toBe(false);
      expect(sim.ledger.poolLiquidity).toBe(1_000_000n); // 1_000_000 - 1000 principal + 1000 collateral

      // the defaulter set holds a 32-byte nullifier, not an address or score
      expect(nul).toHaveLength(32);
    });

    it("liquidation is idempotent-safe: a closed loan cannot be liquidated again", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, DUE);
      sim.setTime(Number(DUE) + 1);
      await sim.liquidate(sim.nullifier(ALICE));
      await expect(sim.liquidate(sim.nullifier(ALICE))).rejects.toThrow(/no active loan/);
    });
  });

  describe("loan term cap", () => {
    // maxLoanTermSeconds() = 90 days. `borrow` bounds dueTime relative to the
    // current block, so a borrower cannot open a loan that stays unliquidatable.
    const MAX_TERM = 7_776_000n;

    it("accepts a loan due exactly at the cap", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await sim.borrow(ps, true, 1000n, 1000n, BigInt(NOW) + MAX_TERM);
      expect(sim.ledger.loans.lookup(sim.nullifier(ALICE)).dueTime).toBe(BigInt(NOW) + MAX_TERM);
    });

    it("rejects one second past the cap", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await expect(
        sim.borrow(ps, true, 1000n, 1000n, BigInt(NOW) + MAX_TERM + 1n),
      ).rejects.toThrow(/loan term exceeds the maximum/);
    });

    it("still rejects a due time in the past", async () => {
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await expect(sim.borrow(ps, true, 1000n, 1000n, BigInt(NOW) - 1n)).rejects.toThrow(
        /due time must be in the future/,
      );
    });
  });

  describe("liquidity guards", () => {
    it("rejects a borrow larger than the pool", async () => {
      await sim.withdrawLiquidity(999_500n); // 500 left
      const ps = borrowerState(ALICE, ALICE_ATTS);
      await expect(sim.borrow(ps, true, 600n, 1000n, DUE)).rejects.toThrow(/insufficient pool liquidity/);
    });
  });
});
