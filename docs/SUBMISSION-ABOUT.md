## The problem

On-chain lending is stuck at over-collateralization. A lender cannot judge a borrower without that borrower handing over their whole financial life, so every position is backed by 150%+ collateral and capital sits idle. Fixing that with credit scoring has meant giving a third party your full history — trading one problem for a worse one.

## Nocturne

Nocturne turns private financial attestations into a **zero-knowledge credit score**, then proves one bit about it — that it clears a tier — so you can borrow under-collateralized without revealing who you are or what you have.

A borrower collects signed attestations (bank-balance band, salary band, repayment history) and links history from their **other wallets**. The score is computed in-circuit. The pool learns one boolean.

| Layer | Contents |
|---|---|
| **Private (witness)** | attestation values and expiries, identity secret, cross-chain history, Merkle paths |
| **Public (ledger)** | pool liquidity, tier LTV/APR rules, issuer attestation root, loans keyed by a nullifier, defaulter set |
| **Disclosed by a proof** | nullifier, tier, principal, collateral, and `score ≥ tier` |

## The demo, in one number

| | Score | Tier | Max LTV | Collateral | Borrows |
|---|---|---|---|---|---|
| Alice | 1210 | 1 | 150% | **1,000** | **1,500** |
| Bob | 500 | 0 | 50% | **1,000** | **500** |

**Identical collateral. Three times the loan.** The ledger records only that someone cleared a higher threshold. Alice's score, balance, salary and linked wallet are never submitted — the Explorer tab lists them as fields that do not exist on chain.

## What is built

- **Six Compact circuits** — `issueAttestation`, `depositLiquidity`, `withdrawLiquidity`, `borrow`, `repay`, `liquidate`
- **Real ZK proofs**, measured against a live proof server: `borrow` **9.2 s → a 5.4 KB proven transaction**; `depositLiquidity` 1.1 s
- **171 tests** — 123 app, 45 contract, 3 live-proving
- **Wallet integration** — Lace via the DApp Connector, AES-GCM private state encrypted under a wallet signature, DUST fee pre-flight, and a `prove → pay fees → submit → confirm` pipeline with its own transaction assembler
- **Every attestation is bound to an issuer-published Merkle leaf** — one with no matching leaf has no path to prove, so inputs cannot be invented

## Security work

Getting this to compile and prove surfaced real, exploitable bugs. Each is fixed and regression-tested — reverting a fix makes a named test fail:

- **`liquidate` minted liquidity from nothing.** `borrow` never took collateral in, but liquidation credited it to the pool. Every default created money.
- **Strategic default was profitable *and* repeatable.** `defaulters` was written but never read, so at 150% LTV a borrower could default, re-borrow, repeat.
- **Exact attestation expiries were leaking.** Passed to a block-time predicate, they became public transaction bounds — and three exact expiries are a near-unique fingerprint an issuer could use to deanonymize a borrower. Freshness is now checked in-circuit against a coarse public bound.
- **LPs could withdraw capital backing open loans.** Accounting is now share-based, so a default marks every position down pro rata rather than leaving the last LP out holding the loss.
- **The cross-chain score was an unbound witness** — any borrower could hand the circuit an arbitrary value and clear any tier. It is now a fourth attestation, verified through the same Merkle path as the rest.

Two constraints shaped the build: **Compact has no division operator**, so interest and share prices are enforced by cross-multiplication at full width; and **every parameter of an exported circuit is treated as private**, so each `disclose()` carries an inline justification.

## Why Midnight

The score lives in private state and is computed in-circuit, so no third party ever holds it. DUST metadata privacy means borrowing does not broadcast financial distress — the settlement tx does not reveal who borrowed, or from which pool. And `liquidate` is the only circuit that reveals an identity: it publishes the defaulter's nullifier and nothing else.

## Run it

```bash
npm install && npm --prefix contracts run compact && npm run sync:zk
npm run dev                       # http://localhost:3000/app
npm run proof-server:up && npm run test:prove    # real proofs
```

Opens in demo mode — **no wallet required**. Switch between Alice and Bob, link Bob's external wallet and watch his score move, borrow, advance the clock, liquidate. Three tabs: **Borrow**, **Pool** (the lender's side), and **Explorer**, which puts the public ledger and the device's private state side by side. That screen is the whole argument.

## Limits

Submitting to a live network is the one step not verified end to end — assembly, proving and fees are; submission needs a funded preprod account. Interest is simple, not compounding. LP shares value open loans at face, so an LP can exit ahead of an unrealised default — as on Aave and Compound.
