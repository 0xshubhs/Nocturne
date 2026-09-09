# defi1 — ZK Under-Collateralized Lending

Private credit scoring and under-collateralized borrowing on
[Midnight](https://midnight.network). Built for the Midnight Buildathon.

A borrower combines off-chain financial attestations (bank-balance range, salary
band, repayment history) with on-chain history from their other wallets into a
**zero-knowledge credit score**, and borrows against it. The lending pool sees
only a score *band* and a validity proof — never the underlying data, the raw
figures, or the borrower's linked wallets.

---

## Problem

On-chain lending is stuck at over-collateralization: a lender cannot assess a
borrower without the borrower doxxing themselves, so every position is backed by
150%+ collateral and capital sits idle. Credit-scoring that reduces collateral
requirements has so far meant handing a third party your full financial history.

## Approach

| Layer | Contents |
|---|---|
| **Private (witness)** | raw attestation values, borrower identity secret, cross-chain history, Merkle paths |
| **Public (ledger)** | pool liquidity, per-tier LTV/APR rules, issuer attestation root, loan records keyed by a pseudonymous nullifier, defaulter set |
| **Disclosed by a proof** | the nullifier, tier, principal, collateral, and the single boolean `score ≥ tier` |

The credit score is computed entirely in-circuit over witness data. `borrow`
asserts `score ≥ tierRule.minScore` and `principal ≤ collateral · maxLTV`,
consumes a **nullifier** so one identity cannot stack loans, and binds every
attestation to an issuer-signed Merkle leaf so a borrower can't fabricate
inputs. `liquidate` is the only circuit that reveals an identity, and it reveals
nothing else.

**Why Midnight:** the score lives in private state, and DUST-based metadata
privacy means borrowing activity doesn't broadcast financial distress — the
settlement transaction doesn't reveal who borrowed or from which pool.

---

## Architecture

```
contracts/                 Compact smart contract + tests
  src/lending.compact       core contract (6 circuits)
  src/witnesses.ts          private-state shape + witness implementations
  src/score.ts              TS reference for the score arithmetic
  src/issuer.ts             mock attestation issuer
  scripts/mint-personas.ts  CLI: mint the demo attestation set
  test/                     in-memory simulator + behavioural & parity suites
src/
  lib/midnight/             Midnight integration layer (see below)
  components/WalletPanel.tsx wallet connect / status UI
  app/                      Next.js App Router pages
```

### Contract (`contracts/`)

Compiles under Compact ≥ 0.23 (`compact` 0.5.2 / compiler 0.34.0),
`compact-runtime` 0.19. Circuits: `issueAttestation`, `depositLiquidity`,
`withdrawLiquidity`, `borrow`, `repay`, `liquidate`.

```bash
cd contracts
npm install
npm run compact        # compile -> src/managed/lending
npm run check          # tsc --noEmit && vitest run   (28 tests)
npm run issuer:mint    # mint the demo attestation set for Alice + Bob
```

Test coverage: score thresholds, cross-chain contribution, expired
attestations, LTV boundary conditions, double-borrow rejection, the liquidation
disclosure surface, TS↔circuit score parity for every demo persona, and the
attestation issuer end to end (issue → borrow, unsigned attestation rejected).

### Midnight integration (`src/lib/midnight/`)

| Module | Responsibility |
|---|---|
| `config` | network endpoints per `NetworkId`; merges the wallet's reported service URIs over defaults |
| `connector` | DApp Connector API — enumerate injected wallets, connect, read the unshielded address, connection status, DUST balance |
| `private-state` | `EncryptedPrivateStateStore` — AES-GCM at rest, key derived from a wallet signature so only the owning wallet can decrypt |
| `codec` | JSON encoding that preserves `bigint` and `Uint8Array` |
| `lending` | borrower private-state shape (mirrors the contract) + a typed store wrapper |
| `signing` | message signing + an external-wallet ownership challenge |
| `fees` | DUST fee state and a pre-flight `assertCanPayFees` check |
| `proof-server` | proof-server health check and the `building → proving → balancing → submitting → confirming` progress machine |
| `providers` | SDK-free foundation: serves compiled ZK assets to the wallet's prover, reads contract state from the indexer |
| `submit` | the `fee check → assemble → prove → balance → submit → confirm` pipeline |
| `lending-client` | `LendingClient` — one method per circuit, composing private state + assembler + submit |
| `use-wallet` | React `WalletProvider` / `useWallet()` |

`submit.ts` takes a `TxAssembler` — the one step that still needs transaction
assembly. `@midnight-ntwrk/midnight-js-contracts` 4.1.1 pins `compact-runtime`
0.16 against our 0.19 toolchain; the assembler is implemented once that gap
closes or via `ledger-v8` from the runtime's `callProofDataTrace`.

---

## Status

| Milestone (`plan.md`) | State |
|---|---|
| §1 Core contract | **Done** — compiles, 28 tests green |
| §2 Attestation issuer | **Done** — `AttestationIssuer`, persona-mint CLI, 8 tests |
| §3 Wallet integration | **Done** — connector, encrypted state, signing, DUST fees, prove→pay→submit pipeline, `LendingClient` (20 app tests); one seam (`TxAssembler`) awaits a runtime-compatible SDK |
| §5 Scoring engine | **Done** — TS reference + circuit parity |
| §6 UI | Shell — landing + wallet panel; dashboards and forms pending |
| §4 Cross-chain import, §7 Demo | Not started |

**4 of 7 milestones complete; 1 in progress.**

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # wallet + private-state unit tests
npm run typecheck
npm run build
```

A Midnight wallet extension (1AM or Lace) is required to connect. Configuration:

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_MIDNIGHT_NETWORK` | `preprod` | target network |
| `NEXT_PUBLIC_PROOF_SERVER` | `http://127.0.0.1:6300` | self-hosted proof server for the health check |

After compiling the contract, run `npm run sync:zk` to copy the proving/verifier
keys into `public/zk/lending/` so the browser can serve them to the wallet's
prover.

---

## Roadmap

1. Implement `TxAssembler` (runtime-compatible `midnight-js-contracts`, or `ledger-v8` from `callProofDataTrace`).
2. Borrower dashboard: attestation inbox, score band, borrow form with live proof progress.
3. Pool view: liquidity, tier rules, deposit/withdraw.
4. Cross-chain history import — verify the ownership signature, commit the derived-history hash.
5. Explorer panel — "what the chain sees" vs "what you know locally".
