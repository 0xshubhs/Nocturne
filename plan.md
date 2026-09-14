# Nocturne — Build Plan

ZK under-collateralized lending on Midnight. Milestones ordered so each layer
unblocks the next.

---

## 1. Core Contract (Compact)

The on-chain trust anchor. Everything else is a client of this.

- **Ledger (public) state**
  - `poolLiquidity: Uint` — deposited capital
  - `tierRules: Map<TierId, { minScore: Uint, maxLTV: Uint, apr: Uint }>` — 2 tiers for MVP
  - `loanCommitments: Set<Bytes>` — outstanding loan hashes
  - `usedNullifiers: Set<Bytes>` — one active loan per identity
- **Witness (private) inputs**
  - raw attestations (bank range, salary band, repayment history)
  - cross-chain history commitments + opening data
  - borrower identity secret (seeds the nullifier)
- **Circuits**
  - `computeScore(attestations) -> Uint` — deterministic scoring, all math in-circuit
  - `borrow(tier, amount, collateral)` — asserts
    `computeScore(...) >= tierRules[tier].minScore`
    ∧ `amount <= collateral * tierRules[tier].maxLTV`
    ∧ `nullifier ∉ usedNullifiers`
    ; emits loan commitment + nullifier
  - `repay(loanCommitment, amount)` — clears commitment + frees nullifier
  - `liquidate(loanCommitment)` — callable after default condition; **discloses only
    the defaulter address**, nothing else
- **Tests**: score thresholds, LTV boundary, double-borrow rejection, liquidation
  disclosure surface

## 2. Attestation Issuer (mock)

Stands in for banks / credit bureaus / oracles.

- Simple signing service (script or tiny API): issues signed attestation blobs
  `{ subject, field, valueRange, expiry, sig }`
- Issuer pubkey baked into the contract as a constant for MVP
- CLI to mint attestations for demo personas ("Alice: strong", "Bob: thin file")
- Later: swap for real oracle / EAS-style attestations

## 3. Wallet Integration

- Integrate Midnight wallet (Lace / Midnight-enabled) via the dApp connector API
- Connect flow: request accounts, read address, handle disconnect
- Local **private state store**: encrypted-at-rest store for attestations +
  cross-chain commitments, keyed to the connected wallet
- Proof server wiring: local proof server config, health check, submit-and-wait UX
- Transaction signing + DUST fee handling; surface fee state without leaking it

## 4. Cross-chain History Import

- Read-only fetch of a user's activity from other EVM/Cardano wallets they own
- User proves ownership of the external wallet (signed message), then we commit a
  hash of the derived history into private state
- MVP: 1 external chain, mocked history JSON accepted with a signature

## 5. Scoring Engine

- Reference implementation of `computeScore` in TS (must match the circuit exactly)
- Deterministic, versioned, documented weightings
- Fixture-based parity tests: TS output == circuit output for every demo persona

## 6. UI (Next.js, App Router)

- **Landing** — the pitch, "connect wallet" CTA
- **Borrower dashboard**
  - attestation inbox: view / import issued attestations (values shown locally only)
  - "link external wallet" step
  - computed score + which tier it unlocks (band only)
  - borrow form: pick tier, amount, collateral → generate proof → submit
  - active loan card: balance, APR, repay button, liquidation risk meter
- **Pool view (lender side)**
  - total liquidity, per-tier LTV/APR, count of outstanding loans
  - deposit / withdraw liquidity
  - shows score *bands* of borrowers, never identities or raw data
- **Proof UX**: progress states for proof generation (slow), clear errors
- **Explorer panel** (demo aid): side-by-side "what the chain sees" vs "what you
  know locally" — the wow moment

## 7. Demo Script

- Seed pool liquidity
- Alice (strong private score) and Bob (weak) post **identical collateral**
- Alice borrows 3x Bob's amount
- Open explorer panel: score bands + proofs visible, identities + data + linked
  wallets unknowable
- Trigger Bob default → liquidation reveals only Bob

## 8. Stretch

- More than 2 tiers / continuous LTV curve
- Real oracle attestations
- Interest accrual over blocks
- Multi-pool with shared nullifier registry (anti loan-stacking across pools)
- Partial liquidation

---

## Workstream order

1. Core contract + tests
2. Mock issuer + scoring engine (parity)
3. Wallet + proof server integration
4. UI borrower flow → pool view
5. Cross-chain import
6. Explorer panel + demo script polish
