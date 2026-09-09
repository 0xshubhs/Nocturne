// defi1 — the mock attestation issuer, end to end against the simulator:
// issue a persona's attestation set, store it as borrower private state, borrow.

import { describe, expect, it } from "vitest";
import { borrowerState, LendingSim } from "./simulator.js";
import {
  AttestationIssuer,
  DEMO_PERSONAS,
  fromHex,
  generateIssuerSecret,
  issuerPublicKey,
  toHex,
} from "../src/issuer.js";

const ISSUER = new Uint8Array(32).fill(7);
const ALICE = new Uint8Array(32).fill(11);
const BOB = new Uint8Array(32).fill(22);
const NOW = 1_000_000;
const EXPIRY = 9_000_000n;
const DUE = 1_500_000n;

async function freshIssuer() {
  const sim = await LendingSim.deploy(ISSUER);
  sim.setTime(NOW);
  await sim.depositLiquidity(1_000_000n);
  const issuer = new AttestationIssuer(ISSUER, (leaf) => sim.issueAttestation(ISSUER, leaf).then(() => undefined));
  return { sim, issuer };
}

describe("AttestationIssuer", () => {
  it("derives the same public key the contract stored at deploy", async () => {
    const { sim, issuer } = await freshIssuer();
    expect(toHex(issuer.publicKey)).toBe(toHex(sim.ledger.issuerPk));
  });

  it("issues a persona set that unlocks the expected tier", async () => {
    const { sim, issuer } = await freshIssuer();

    const aliceAtts = await issuer.issuePersona("alice", ALICE, EXPIRY);
    expect(sim.ledger.attestationRoot.firstFree()).toBe(3n);

    const ps = borrowerState(
      ALICE,
      { bank: aliceAtts.bank, salary: aliceAtts.salary, repay: aliceAtts.repay },
      0n,
    );
    await sim.borrow(ps, true, 1000n, 1000n, DUE); // tier 1
    expect(sim.ledger.loans.lookup(sim.nullifier(ALICE)).tier).toBe(1n);
  });

  it("bob's band is tier 0 only without cross-chain, tier 1 with it", async () => {
    const { sim, issuer } = await freshIssuer();
    const atts = await issuer.issuePersona("bob", BOB, EXPIRY);
    const base = { bank: atts.bank, salary: atts.salary, repay: atts.repay };

    await expect(sim.borrow(borrowerState(BOB, base, 0n), true, 400n, 1000n, DUE)).rejects.toThrow(
      /score below required tier/,
    );

    const sim2 = (await freshIssuer()).sim;
    await new AttestationIssuer(ISSUER, (l) => sim2.issueAttestation(ISSUER, l).then(() => undefined)).issuePersona(
      "bob",
      BOB,
      EXPIRY,
    );
    await sim2.borrow(borrowerState(BOB, base, 300n), true, 400n, 1000n, DUE);
    expect(sim2.ledger.loans.lookup(sim2.nullifier(BOB)).tier).toBe(1n);
  });

  it("an attestation the issuer never signed cannot be used", async () => {
    const { sim } = await freshIssuer();
    // no issue call — borrower fabricates the values
    const ps = borrowerState(
      ALICE,
      { bank: { value: 999n, expiry: EXPIRY }, salary: { value: 999n, expiry: EXPIRY }, repay: { value: 999n, expiry: EXPIRY } },
      0n,
    );
    await expect(sim.borrow(ps, true, 100n, 1000n, DUE)).rejects.toThrow(/attestation leaf not found/);
  });

  it("issue() returns a record whose leaf matches what was submitted", async () => {
    const submitted: string[] = [];
    const issuer = new AttestationIssuer(ISSUER, async (leaf) => void submitted.push(toHex(leaf)));
    const req = { subjectSecret: ALICE, field: "bank" as const, value: 200n, expiry: EXPIRY };
    const rec = await issuer.issue(req);
    expect(rec).toEqual({ field: "bank", value: 200n, expiry: EXPIRY });
    expect(submitted).toEqual([toHex(issuer.leafFor(req))]);
  });
});

describe("keypair helpers", () => {
  it("generateIssuerSecret is 32 bytes and round-trips through hex", () => {
    const sk = generateIssuerSecret();
    expect(sk).toHaveLength(32);
    expect(fromHex(toHex(sk))).toEqual(sk);
  });

  it("issuerPublicKey is deterministic", () => {
    expect(toHex(issuerPublicKey(ISSUER))).toBe(toHex(issuerPublicKey(ISSUER)));
  });

  it("demo persona bands are the documented values", () => {
    expect(DEMO_PERSONAS.alice).toEqual({ bank: 200n, salary: 150n, repay: 90n });
    expect(DEMO_PERSONAS.bob).toEqual({ bank: 100n, salary: 80n, repay: 15n });
  });
});
