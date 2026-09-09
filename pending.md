# defi1 — Pending

Working checklist. Not committed. Move items to done as they land.

## Now
- [x] Scaffold `contracts/` with a Compact starter contract
- [x] Define ledger state struct + tier rules constant (2 tiers)
- [x] Scoring model: bank x2, salary x3, repay x4, + crossChain (mirrored in score.ts)
- [x] Reworked to Compact >= 0.23 + applied REVIEW.md S1/S2/S5/S7/S8, C1/C2/C3
- [ ] Install the `compact` compiler and compile `src/lending.compact`

## Core contract
- [~] `borrow` — score gate + LTV + nullifier + attestation-root check — written, uncompiled
- [~] `repay` — written, uncompiled
- [~] `liquidate` — written; reveals only the defaulter nullifier
- [~] `issueAttestation` — mock issuer inserts a leaf into `attestationRoot`
- [x] `depositLiquidity` / `withdrawLiquidity`
- [ ] Confirm `path.leaf` accessor + `merkleTreePathRoot` arity vs runtime
- [ ] Confirm `?:` returning a struct (`useTier1 ? tier1 : tier0`); else branch explicitly
- [ ] Term cap for `dueTime` — no block-time getter; needs a keeper/oracle
- [ ] Contract test suite (thresholds, LTV boundary, double-borrow, disclosure)
- [ ] Parity test: `score.ts` vs the circuit's score arithmetic

## Attestation issuer
- [x] Model chosen: issuer maintains `attestationRoot`, calls `issueAttestation(leaf)`
- [ ] Issuer keypair + `deriveIssuerPk` wiring; pass secret to constructor at deploy
- [ ] Service/script that builds leaves and submits `issueAttestation`
- [ ] CLI to mint attestations for demo personas (Alice strong, Bob thin)
- [ ] Client-side `pathFor` in witnesses.ts — recompute leaf, query tree for path

## Scoring engine
- [x] TS reference `score.ts` mirroring the circuit arithmetic
- [ ] Parity tests (TS output == circuit output) per persona

## Wallet + infra
- [ ] Wallet connector integration (connect / address / disconnect)
- [ ] Local encrypted private-state store keyed to wallet
- [ ] Local proof server config + health check
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
