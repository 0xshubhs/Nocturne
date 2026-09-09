# defi1 — ZK Under-Collateralized Lending

**Midnight Buildathon project.** Next.js app (App Router, TypeScript, Tailwind).

## The problem

DeFi lending is stuck at over-collateralization because a lender can't assess a
borrower without doxxing them. So everyone posts 150%+ collateral and capital
sits idle.

## The idea

A borrower pulls in **off-chain signals** (bank balance range, salary band,
repayment history) and **on-chain history** from their other wallets and chains,
compiles them into a **ZK credit score**, and borrows **under-collateralized**.

The pool only ever sees a **score band** and a **proof** — never the underlying
data, never the linked wallets.

## Why Midnight

- The score is computed over **private witness data**; the pool contract gates on
  `score ≥ tier` with a **nullifier** so one identity can't stack loans across
  pools.
- **Metadata privacy (DUST)** means your borrowing activity doesn't advertise
  financial distress — the settlement tx doesn't leak who is borrowing or from
  where.

## State model

| | |
|---|---|
| **Private state** | raw financial attestations + cross-chain history commitments |
| **Public state** | pool liquidity, per-tier LTV rules, outstanding loan commitments |

## The ZK moment

```
computeScore(attestations) ≥ requiredTier  ∧  noActiveLoan(nullifier)
```

## MVP scope

- One lending pool
- 2 credit tiers
- Mock attestation issuer
- A loan that **liquidates on default**, revealing only the defaulter

## The wow

Two borrowers post **identical collateral**. The one with the better private
score borrows **3x more** — and the chain shows *why* is unknowable.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.
