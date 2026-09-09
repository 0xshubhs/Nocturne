# defi1 — Pending

Working checklist. Not committed. Move items to done as they land.

## Milestone status (plan.md)

- **§1 Core Contract — DONE.** Compiles under Compact 0.23 (`compact 0.5.2`,
  compiler 0.34.0), all 6 circuits + proving/verifier keys generated. Full
  behavioural test suite green (`test/lending.test.ts`, 14 cases) + score parity
  (`test/score.parity.test.ts`, 6 cases). 20/20 passing, `tsc --noEmit` clean.
- **§5 Scoring Engine — DONE.** `score.ts` reference + fixture parity vs the
  compiled `scoreOf` circuit for every persona (alice / bob / zero / expired).
- §2 Attestation issuer — model + in-circuit verification done; issuer service,
  persona CLI, deploy wiring still open.
- §3 wallet, §4 cross-chain, §6 UI, §7 demo — not started.

## Now
- [x] Scaffold `contracts/` with a Compact starter contract
- [x] Define ledger state struct + tier rules constant (2 tiers)
- [x] Scoring model: bank x2, salary x3, repay x4, + crossChain (mirrored in score.ts)
- [x] Reworked to Compact >= 0.23 + applied REVIEW.md S1/S2/S5/S7/S8, C1/C2/C3
- [x] Install the `compact` compiler and compile `src/lending.compact` (compiles clean)

## Core contract
- [x] `borrow` — score gate + LTV + nullifier + attestation-root check — compiled + tested
- [x] `repay` — compiled + tested
- [x] `liquidate` — reveals only the defaulter nullifier — compiled + tested
- [x] `issueAttestation` — mock issuer inserts a leaf into `attestationRoot`
- [x] `depositLiquidity` / `withdrawLiquidity`
- [x] `path.leaf` accessor + `merkleTreePathRoot` arity — confirmed against runtime (Merkle-path check passes in tests)
- [x] `?:` returning a struct (`t1 ? tier1 : tier0`) — confirmed, compiles + works
- [x] Contract test suite (thresholds, LTV boundary, double-borrow, disclosure) — `test/lending.test.ts`
- [x] Parity test: `score.ts` vs the circuit's score arithmetic — `test/score.parity.test.ts`
- [x] In-memory simulator (`test/simulator.ts`) — no proof server, threads block time
- [ ] Term cap for `dueTime` — no block-time getter; `borrow` only asserts due-in-future. Needs a keeper/oracle for a relative term.

## Attestation issuer
- [x] Model chosen: issuer maintains `attestationRoot`, calls `issueAttestation(leaf)`
- [x] In-circuit attestation validation (leaf ∈ root + leaf binds (field,value,expiry,subject))
- [x] Client-side `pathFor` in witnesses.ts — recompute leaf, query tree for path
- [ ] Issuer keypair management + deploy script (constructor already takes `issuerSecret`)
- [ ] Service/script that builds leaves and submits `issueAttestation`
- [ ] CLI to mint attestations for demo personas (Alice strong, Bob thin)

## Scoring engine
- [x] TS reference `score.ts` mirroring the circuit arithmetic
- [x] Parity tests (TS output == circuit output) per persona

## Wallet + infra
- [ ] Wallet connector integration (connect / address / disconnect)
- [ ] Local encrypted private-state store keyed to wallet
- [ ] Local proof server config + health check
- [ ] Full ZK key generation is done locally; wire proof server for real proofs
- [ ] DUST fee handling in the submit flow

## Cross-chain import
- [ ] External-wallet ownership proof (signed message)
- [ ] Commit hash of derived history into private state
- [ ] Mock history JSON ingestion for demo

## UI
- [ ] Landing + connect CTA
- [ ] Borrower dashboard: attestation inbox
- [ ] Borrower dashboard: link external wallet
- [ ] Score + tier band display
- [ ] Borrow form → proof generation → submit
- [ ] Active loan card (balance, APR, repay, risk meter)
- [ ] Pool view: liquidity, tier rules, outstanding count, deposit/withdraw
- [ ] Proof progress + error states
- [ ] Explorer panel (chain-sees vs you-know)

## Demo
- [ ] Seed script for pool liquidity + personas
- [ ] End-to-end demo run: identical collateral, 3x borrow delta
- [ ] Default → liquidation reveals only Bob

## Open questions
- [ ] Which Midnight wallet for the demo (Lace / other)?
- [ ] Local proof server perf — acceptable for live demo?
- [ ] Collateral asset — native token or mock ERC-20 equivalent?
- [ ] Default condition — time-based, oracle-based, or manual trigger for demo?
- [ ] Testnet faucet + DUST availability for demo accounts
