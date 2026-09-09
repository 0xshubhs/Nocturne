# defi1 — Pending

Working checklist tracked alongside the code. `[x]` done, `[~]` partial, `[ ]` open.
Milestones §1, §2, §3, §5 are complete and pushed; §6 is a shell.

## Milestone status (plan.md)

- **§1 Core Contract — DONE.** Compiles under Compact 0.23 (`compact 0.5.2`,
  compiler 0.34.0), all 6 circuits + proving/verifier keys generated. Full
  behavioural test suite green (`test/lending.test.ts`, 14 cases) + score parity
  (`test/score.parity.test.ts`, 6 cases). 20/20 passing, `tsc --noEmit` clean.
- **§5 Scoring Engine — DONE.** `score.ts` reference + fixture parity vs the
  compiled `scoreOf` circuit for every persona (alice / bob / zero / expired).
- **§2 Attestation Issuer — DONE.** `contracts/src/issuer.ts` —
  `AttestationIssuer` (keypair helpers, leaf construction, demo-persona bands),
  transport-agnostic `submitLeaf`. `contracts/scripts/mint-personas.ts` CLI
  (`npm run issuer:mint`) mints Alice (strong) + Bob (thin file) and emits the
  private-state bundle. `test/issuer.test.ts` (8 cases) proves issue → borrow
  end to end and rejects an unsigned attestation. In-circuit validation was
  already in place from §1.
- **§3 Wallet Integration — DONE.** `src/lib/midnight/`: DApp Connector wrapper,
  React `WalletProvider`/`useWallet`, AES-GCM encrypted private-state store keyed
  to a wallet signature, proof-server health check, message signing +
  external-wallet ownership challenge, DUST fee state + pre-flight check, and the
  `prove → pay fees → submit → confirm` pipeline (`submit.ts`) wired to the
  phase machine. `LendingClient` composes it all. 20 app unit tests, `tsc`
  clean, `next build` green. The one remaining seam is transaction assembly
  (`TxAssembler`) — `midnight-js-contracts` is version-blocked on our Compact
  0.34 / runtime 0.19 toolchain; the runtime already produces the
  `callProofDataTrace` it needs.
- §6 UI — landing page + wallet-connect panel shipped; borrower dashboard,
  borrow form, pool view, explorer panel not started.
- §4 cross-chain, §7 demo — not started.

Score so far: **4 milestones done (§1, §2, §3, §5), 1 in progress (§6 shell).**

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
- [x] `AttestationIssuer` — keypair helpers, leaf construction, `issue`/`issueSet`/`issuePersona`, transport-agnostic `submitLeaf` — `contracts/src/issuer.ts`
- [x] Demo-persona bands (Alice strong / Bob thin) tuned to the tier table
- [x] CLI to mint personas — `npm run issuer:mint` (`scripts/mint-personas.ts`), emits the private-state bundle
- [x] `test/issuer.test.ts` (8 cases) — issue → borrow end to end, unsigned attestation rejected
- [ ] Deploy script proper — folded into §3 `TxAssembler` (needs tx assembly)

## Scoring engine
- [x] TS reference `score.ts` mirroring the circuit arithmetic
- [x] Parity tests (TS output == circuit output) per persona

## Wallet + infra
- [x] Wallet connector integration (connect / address / disconnect) — `connector.ts`, `use-wallet.tsx`
- [x] Local encrypted private-state store keyed to wallet — `private-state.ts` (AES-GCM, key from a wallet signature) + `lending.ts` typed wrapper; unit-tested
- [x] Local proof server config + health check — `config.ts` + `checkProofServerHealth` in `proof-server.ts`
- [x] Message signing + external-wallet ownership challenge — `signing.ts`
- [x] DUST fee state + pre-flight `assertCanPayFees` — `fees.ts`
- [x] Submit pipeline — `submit.ts`: fee check → assemble → prove (`getProvingProvider`) → `balanceUnsealedTransaction({payFees:true})` → `submitTransaction` → poll indexer, driven by the phase machine
- [x] `LendingClient` — private state + assembler + submit, one method per circuit — `lending-client.ts`
- [x] SDK-free provider foundation — `providers.ts`: `FetchKeyMaterialProvider`, `queryContractState`
- [x] Unit tests for fees / signing / submit pipeline / client orchestration — `submit.test.ts` (9 cases, fake wallet + fake assembler)
- [ ] `TxAssembler` implementation — build the unproven contract-call tx. `midnight-js-contracts` 4.1.1 pins `compact-runtime` 0.16 vs our 0.19; either it catches up, or hand-roll via `ledger-v8` from the runtime's `callProofDataTrace`.
- [ ] `npm run sync:zk` to copy compiled keys into `public/zk/lending/` before a real proof

## App / infra
- [x] Next 16 app builds (`next build`), `tsc --noEmit` clean, vitest wired (`npm test`)
- [x] `WalletProvider` in `layout.tsx`; `@/lib/midnight` barrel export
- [x] `src/lib/midnight/` unit tests (codec, encrypted store, config, phase machine, fees, signing, submit, client) — 20 cases
- [x] tsconfig `target` bumped to ES2020 (bigint), `contracts/` excluded from app typecheck
- [x] `tsx` + `contracts` scripts (`issuer:mint`, `issuer:new-key`)
- [ ] eslint pass over `src/lib/midnight/` (not yet run)

## Cross-chain import
- [x] External-wallet ownership proof (signed message) — `signing.ts` `proveExternalWalletOwnership` / `ownershipChallenge`
- [ ] Verify the signature + commit the derived-history hash into private state
- [ ] Mock history JSON ingestion for demo

## UI
- [x] Landing + connect CTA — `page.tsx` + `WalletPanel` (address, DUST, proof-server status)
- [x] Proof progress primitives — `ProofProgress` / `runWithProgress` (render component still TODO)
- [ ] Borrower dashboard: attestation inbox
- [ ] Borrower dashboard: link external wallet
- [ ] Score + tier band display
- [ ] Borrow form → proof generation → submit
- [ ] Active loan card (balance, APR, repay, risk meter)
- [ ] Pool view: liquidity, tier rules, outstanding count, deposit/withdraw
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
