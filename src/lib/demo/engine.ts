// Nocturne — in-browser demo ledger.
//
// Mirrors the public state transitions of `contracts/src/lending.compact` so
// the whole borrower and lender flow is clickable with no node, no proof
// server and no wallet. It is the browser twin of `contracts/test/simulator.ts`,
// which runs the *real* compiled circuits — that suite is the authority, and
// `npm --prefix contracts run demo` is the version to show a skeptic.
//
// Two deliberate differences from the chain, both marked below:
//
//   · Hashing is SHA-256 rather than the circuit's `persistentHash`. Nullifiers
//     and leaves are therefore demo-local pseudonyms — the same shape and the
//     same unlinkability, different bytes.
//   · There is no proof. `borrow` re-checks every assert the circuit makes and
//     throws the same message, but nothing here is cryptographically binding.
//
// Every assert below is kept in the same order, with the same text, as the
// circuit — so an error surfaced in the UI is the error the chain would give.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  ATTESTATION_FIELDS,
  MAX_LOAN_TERM_SECONDS,
  TIER_RULES,
  scoreFromSet,
  type Attestation,
  type AttestationField,
  type AttestationSet,
  type TierId,
} from "@/lib/midnight/score";

// ---------------------------------------------------------------------------
// Identity + leaves — SHA-256 stand-ins for the circuit's persistentHash
// ---------------------------------------------------------------------------

function domainHash(domain: string, ...parts: string[]): string {
  return bytesToHex(sha256(new TextEncoder().encode([domain, ...parts].join("|"))));
}

/** Pseudonymous borrower id: the loan key and the double-borrow guard. */
export function nullifierFor(secret: string): string {
  return domainHash("nocturne:nullifier:v1", secret);
}

/** Binds an attestation to a subject without linking it to the nullifier. */
export function subjectIdFor(secret: string): string {
  return domainHash("nocturne:subject:v1", secret);
}

/** The leaf the issuer commits for one attestation. */
export function attestationLeaf(
  field: AttestationField,
  att: Attestation,
  subject: string,
): string {
  return domainHash(`nocturne:att:${field.toLowerCase()}:v1`, subject, String(att.value), String(att.expiry));
}

// ---------------------------------------------------------------------------
// Ledger state — exactly what an observer can read
// ---------------------------------------------------------------------------

export type DemoLoan = {
  tier: TierId;
  principal: bigint;
  collateral: bigint;
  dueTime: bigint;
};

export type DemoLedger = {
  poolLiquidity: bigint;
  /** nullifier (hex) -> loan */
  loans: Record<string, DemoLoan>;
  /** Leaves the issuer has published. Opaque hashes, in insertion order. */
  attestationLeaves: string[];
  /** Nullifiers revealed by liquidation — the one identity disclosure. */
  defaulters: string[];
  /** Monotonic count of loans ever opened. */
  loanCount: number;
  /** Simulated block time, unix seconds. */
  blockTime: bigint;
};

export function emptyLedger(now: bigint): DemoLedger {
  return {
    poolLiquidity: 0n,
    loans: {},
    attestationLeaves: [],
    defaulters: [],
    loanCount: 0,
    blockTime: now,
  };
}

export class DemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoError";
  }
}

/** Every circuit assert, in circuit order, with the circuit's own message. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new DemoError(message);
}

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------

export type BorrowArgs = {
  secret: string;
  attestations: AttestationSet;
  tier: TierId;
  amount: bigint;
  collateral: bigint;
  dueTime: bigint;
};

/**
 * A pure reducer over the ledger: every call returns a new state, so the UI can
 * keep history and the explorer panel can diff. Throws `DemoError` with the
 * contract's message when an assert would fail on-chain.
 */
export const demo = {
  issueAttestation(ledger: DemoLedger, leaf: string): DemoLedger {
    if (ledger.attestationLeaves.includes(leaf)) return ledger;
    return { ...ledger, attestationLeaves: [...ledger.attestationLeaves, leaf] };
  },

  /** Issue the full set for a subject, as the issuer would at onboarding. */
  issueSet(ledger: DemoLedger, secret: string, set: AttestationSet): DemoLedger {
    const subject = subjectIdFor(secret);
    let next = ledger;
    for (const field of ATTESTATION_FIELDS) {
      const att = set[field];
      if (att) next = demo.issueAttestation(next, attestationLeaf(field, att, subject));
    }
    return next;
  },

  depositLiquidity(ledger: DemoLedger, amount: bigint): DemoLedger {
    assert(amount > 0n, "deposit must be positive");
    return { ...ledger, poolLiquidity: ledger.poolLiquidity + amount };
  },

  withdrawLiquidity(ledger: DemoLedger, amount: bigint): DemoLedger {
    assert(amount <= ledger.poolLiquidity, "insufficient pool liquidity");
    return { ...ledger, poolLiquidity: ledger.poolLiquidity - amount };
  },

  borrow(ledger: DemoLedger, args: BorrowArgs): DemoLedger {
    const { secret, attestations, tier, amount, collateral, dueTime } = args;
    const nullifier = nullifierFor(secret);
    const rule = TIER_RULES[tier];

    assert(!(nullifier in ledger.loans), "identity already has an active loan");
    assert(ledger.blockTime < dueTime, "due time must be in the future");

    const termFloor = dueTime >= MAX_LOAN_TERM_SECONDS ? dueTime - MAX_LOAN_TERM_SECONDS : 0n;
    assert(ledger.blockTime >= termFloor, "loan term exceeds the maximum");

    // Each attestation must be one the issuer actually published, and live.
    const subject = subjectIdFor(secret);
    for (const field of ATTESTATION_FIELDS) {
      const att = attestations[field];
      assert(
        att !== undefined && ledger.attestationLeaves.includes(attestationLeaf(field, att, subject)),
        "attestation not issued by the issuer",
      );
      assert(att.expiry > ledger.blockTime, "attestation expired");
    }

    const score = scoreFromSet(attestations, ledger.blockTime);
    assert(score >= rule.minScore, "score below required tier");
    assert(amount * 10000n <= collateral * rule.maxLtvBps, "exceeds max LTV for tier");
    assert(amount <= ledger.poolLiquidity, "insufficient pool liquidity");

    return {
      ...ledger,
      poolLiquidity: ledger.poolLiquidity - amount,
      loans: { ...ledger.loans, [nullifier]: { tier, principal: amount, collateral, dueTime } },
      loanCount: ledger.loanCount + 1,
    };
  },

  repay(ledger: DemoLedger, secret: string, amount: bigint): DemoLedger {
    const nullifier = nullifierFor(secret);
    const loan = ledger.loans[nullifier];
    assert(loan !== undefined, "no active loan for identity");
    assert(amount >= loan.principal, "repayment below principal");

    const loans = { ...ledger.loans };
    delete loans[nullifier];
    return { ...ledger, loans, poolLiquidity: ledger.poolLiquidity + amount };
  },

  liquidate(ledger: DemoLedger, nullifier: string): DemoLedger {
    const loan = ledger.loans[nullifier];
    assert(loan !== undefined, "no active loan");
    assert(ledger.blockTime >= loan.dueTime, "loan not yet in default");

    const loans = { ...ledger.loans };
    delete loans[nullifier];
    return {
      ...ledger,
      loans,
      poolLiquidity: ledger.poolLiquidity + loan.collateral,
      defaulters: ledger.defaulters.includes(nullifier)
        ? ledger.defaulters
        : [...ledger.defaulters, nullifier],
    };
  },

  /** Advance the simulated clock — the demo's stand-in for waiting for a block. */
  advanceTime(ledger: DemoLedger, seconds: bigint): DemoLedger {
    return { ...ledger, blockTime: ledger.blockTime + seconds };
  },
};

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function loanFor(ledger: DemoLedger, secret: string): DemoLoan | null {
  return ledger.loans[nullifierFor(secret)] ?? null;
}

export function isInDefault(ledger: DemoLedger, secret: string): boolean {
  const loan = loanFor(ledger, secret);
  return loan !== null && ledger.blockTime >= loan.dueTime;
}

export function wasLiquidated(ledger: DemoLedger, secret: string): boolean {
  return ledger.defaulters.includes(nullifierFor(secret));
}

/** Outstanding principal across the pool. */
export function totalOutstanding(ledger: DemoLedger): bigint {
  return Object.values(ledger.loans).reduce((acc, l) => acc + l.principal, 0n);
}

/**
 * How close a loan is to liquidation, 0..1. Purely a UI aid — the contract has
 * no notion of partial risk, only "past due or not".
 */
export function liquidationRisk(ledger: DemoLedger, loan: DemoLoan, openedAt: bigint): number {
  if (ledger.blockTime >= loan.dueTime) return 1;
  const span = loan.dueTime - openedAt;
  if (span <= 0n) return 1;
  const elapsed = ledger.blockTime - openedAt;
  return Math.max(0, Math.min(1, Number((elapsed * 1000n) / span) / 1000));
}
