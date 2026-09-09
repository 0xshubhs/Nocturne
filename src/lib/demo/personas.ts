// defi1 — the two demo borrowers (plan.md §7).
//
// The attestation bands are the same numbers `contracts/src/issuer.ts` mints
// for `DEMO_PERSONAS`, so the browser demo and `npm --prefix contracts run
// demo` tell the same story:
//
//   alice  200*2 + 150*3 +  90*4 +   0 = 1210  -> tier 1, borrows 150% of collateral
//   bob    100*2 +  80*3 +  15*4 + 120 =  620  -> tier 0, borrows  50% of collateral
//
// Identical collateral, 3x the loan, and the chain cannot tell you why.

import type { AttestationSet } from "@/lib/midnight/score";
import type { ExternalHistory } from "@/lib/midnight/cross-chain";
import { DEMO_EVM_ADDRESS } from "./evm-signer";

export type PersonaId = "alice" | "bob";

export type Persona = {
  id: PersonaId;
  name: string;
  blurb: string;
  /** Demo-local identity secret. On-chain this never leaves the device. */
  secret: string;
  /** Values the issuer attests. `crossChain` starts at 0 until a wallet links. */
  bands: { bank: bigint; salary: bigint; repay: bigint };
  /**
   * The external wallet this persona can link during the demo, and the history
   * an indexer would return for it. Alice has none — she reaches tier 1 on her
   * institutional attestations alone.
   */
  externalWallet?: { address: string; history: ExternalHistory };
};

const YEAR = 365 * 24 * 3600;

/** Attestations are minted with a one-year life from the demo's start. */
export function expiryFrom(now: bigint): bigint {
  return now + BigInt(YEAR);
}

// The address the built-in demo signer actually controls, so the ownership
// proof Bob produces verifies for real rather than being waved through.
const BOB_WALLET = DEMO_EVM_ADDRESS;

export const PERSONAS: Record<PersonaId, Persona> = {
  alice: {
    id: "alice",
    name: "Alice",
    blurb:
      "Long banking relationship, steady salary, clean repayment record. Reaches the top tier on institutional attestations alone.",
    secret: "defi1-demo-secret-alice",
    bands: { bank: 200n, salary: 150n, repay: 90n },
  },
  bob: {
    id: "bob",
    name: "Bob",
    blurb:
      "Thin file — newer bank account, smaller salary band, little borrowing history. His on-chain past is the only credit story he has.",
    secret: "defi1-demo-secret-bob",
    bands: { bank: 100n, salary: 80n, repay: 15n },
    externalWallet: {
      address: BOB_WALLET,
      history: {
        chain: "ethereum",
        address: BOB_WALLET,
        // Filled in relative to the demo clock by `historyFor`.
        firstActivityUnix: 0,
        txCount: 640,
        activeMonths: 22,
        loansRepaid: 1,
        loansLiquidated: 0,
      },
    },
  },
};

export const PERSONA_IDS: readonly PersonaId[] = ["alice", "bob"] as const;

/**
 * The persona's external history, dated relative to the demo clock so the
 * derived score does not drift as the demo's `now` moves.
 */
export function historyFor(persona: Persona, now: bigint): ExternalHistory | null {
  if (!persona.externalWallet) return null;
  return {
    ...persona.externalWallet.history,
    // ~2.5 years of history
    firstActivityUnix: Number(now) - Math.floor(2.5 * YEAR),
  };
}

/** The attestation set the issuer mints for a persona at onboarding. */
export function initialAttestations(persona: Persona, now: bigint): AttestationSet {
  const expiry = expiryFrom(now);
  return {
    bank: { value: persona.bands.bank, expiry },
    salary: { value: persona.bands.salary, expiry },
    repay: { value: persona.bands.repay, expiry },
    // Every subject is onboarded with a zero-valued cross-chain leaf so there
    // is always a path to prove — see the witness comment in lending.compact.
    crossChain: { value: 0n, expiry },
  };
}

/** Pool liquidity the demo starts with. */
export const SEED_LIQUIDITY = 1_000_000n;

/** Collateral both personas post, so the loan delta is the only difference. */
export const DEMO_COLLATERAL = 1000n;

/** Default loan term offered in the borrow form (30 days, inside the 90-day cap). */
export const DEFAULT_TERM_SECONDS = 30n * 24n * 3600n;
