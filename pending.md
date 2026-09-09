# defi1 — Pending

Working checklist. Not committed. Move items to done as they land.

## Now
- [x] Scaffold `contracts/` with a Compact starter contract
- [x] Define ledger state struct + tier rules constant (2 tiers)
- [~] Scoring model drafted (fields 0/1/2, weights 2/3/4 + crossChain) — needs sign-off
- [ ] Install `compactc` and compile `src/lending.compact`

## Core contract
- [~] `computeScore` circuit — drafted in `lending.compact`, uncompiled
- [~] `borrow` circuit (score gate + LTV check + nullifier) — drafted, uncompiled
- [~] `repay` circuit — drafted, uncompiled
- [~] `liquidate` circuit — drafted; confirm it discloses *only* the defaulter once compiling
- [x] `depositLiquidity` / `withdrawLiquidity` circuits — drafted
- [ ] Resolve syntax against installed compiler (assert form, ledger ADT methods, disclose)
- [ ] `witnessCollateral` / `loanSalt` re-derivation in repay — review commitment binding
- [ ] Contract test suite (thresholds, LTV boundary, double-borrow, disclosure)
- [ ] Parity test: `score.ts` vs `computeScore` circuit

## Attestation issuer
- [ ] Signing service / script
- [ ] Issuer keypair; bake pubkey into contract
- [ ] CLI to mint attestations for demo personas (Alice strong, Bob thin)

## Scoring engine
- [ ] TS reference `computeScore` matching the circuit
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
