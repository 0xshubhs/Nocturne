# Nocturne — Pending

Working checklist tracked alongside the code. `[x]` done, `[~]` partial, `[ ]` open.
Milestones §1–§7 are complete, and so is transaction assembly — the app can
build, prove, balance and submit real contract transactions. What has *not*
happened is a run against a live network; see "Known gaps" at the bottom.

## Milestone status (plan.md)

- **§1 Core Contract — DONE.** Compiles under Compact 0.23 (`compact 0.5.2`,
  compiler 0.34.0), all 6 circuits + proving/verifier keys generated
  (full ZK compile, ~20s). Behavioural suite green (`test/lending.test.ts`,
  19 cases) + score parity (6) + term-cap parity (4) + issuer (9) + demo
  narrative (7). **45/45 passing**, `tsc --noEmit` clean.
- **§2 Attestation Issuer — DONE.** `contracts/src/issuer.ts` —
  `AttestationIssuer` (keypair helpers, leaf construction, demo-persona bands,
  `attestCrossChain` with a cap), transport-agnostic `submitLeaf`.
  `contracts/scripts/mint-personas.ts` CLI (`npm run issuer:mint`).
- **§3 Wallet Integration — DONE.** `src/lib/midnight/`: DApp Connector wrapper,
  React `WalletProvider`/`useWallet`, AES-GCM encrypted private-state store keyed
  to a wallet signature, proof-server health check, message signing, DUST fee
  state + pre-flight check, and the `prove → pay fees → submit → confirm`
  pipeline (`submit.ts`) wired to the phase machine. `LendingClient` composes it.
- **§4 Cross-chain Import — DONE.** `src/lib/midnight/cross-chain.ts`: nonce-bound
  EIP-191 challenge, real secp256k1 recovery (`@noble/curves`), bounded score
  derivation, history commitment, and untrusted-document parsing.
  `src/lib/demo/link-flow.ts` runs the whole flow; 39 tests across the two.
- **§5 Scoring Engine — DONE.** `contracts/src/score.ts` reference + fixture
  parity vs the compiled `scoreOf` circuit, mirrored for the browser in
  `src/lib/midnight/score.ts` against the same fixtures.
- **§6 UI — DONE.** Dark web3 dashboard: attestation inbox, score + tier bands,
  link-external-wallet, borrow form with live proof phases, active-loan card with
  a risk meter, pool/lender view with liquidation, and the explorer panel.
- **§7 Demo — DONE.** `npm --prefix contracts run demo` narrates the full story
  against the real compiled circuits; `npm --prefix contracts run seed` seeds a
  pool and emits the persona bundle; the browser demo does the same interactively.

Score: **7 of 7 milestones complete, plus transaction assembly.** 168 tests
green (123 app + 45 contracts), `tsc` clean in both packages, `eslint` clean,
`next build` green.

## Core contract
- [x] `borrow` — score gate + LTV + nullifier + attestation-root check
- [x] `repay`, `liquidate` (reveals only the defaulter nullifier)
- [x] `issueAttestation`, `depositLiquidity`, `withdrawLiquidity`
- [x] Contract test suite (thresholds, LTV boundary, double-borrow, disclosure)
- [x] Parity test: `score.ts` vs the circuit's score arithmetic
- [x] In-memory simulator (`test/simulator.ts`) — no proof server, threads block time
- [x] **Term cap for `dueTime`.** There is no block-time getter, only
  `blockTimeLt` / `blockTimeGte`, so the bound is a second comparison:
  `due - maxLoanTermSeconds()` must already be in the past, which is exactly
  `due <= now + 90 days`. Guarded against Uint underflow for a `due` inside the
  first 90 days of the epoch.
- [x] **Cross-chain score is attested, not asserted.** It was an unconstrained
  witness — any borrower could hand the circuit `crossChainScore = 10^18` and
  clear any tier. It is now a fourth attestation field
  (`nocturne:att:crosschain:v1`) verified through the same Merkle path as the other
  three; every subject is onboarded with a zero-valued leaf so there is always a
  path to prove. Regression-tested both ways.
- [x] Tier spread widened to 3x (tier 0 → 50% LTV, tier 1 → 150%) so the demo's
  headline claim — identical collateral, 3x the loan — is literally true.

## Attestation issuer
- [x] Issuer maintains `attestationRoot`, calls `issueAttestation(leaf)`
- [x] In-circuit validation (leaf ∈ root + leaf binds field/value/expiry/subject)
- [x] Client-side `pathFor` in witnesses.ts
- [x] `AttestationIssuer` + demo-persona bands + `attestCrossChain` (capped at 300)
- [x] CLI to mint personas — `npm run issuer:mint`
- [x] `test/issuer.test.ts` — issue → borrow end to end, unsigned attestation rejected
- [x] Deploy path — `MidnightTxAssembler.deploy()` assembles the deployment,
  installs the verifier keys, and returns the contract address plus the
  maintenance signing key. Driven from `connectLending().deploy()`.

## Scoring engine
- [x] TS reference `score.ts` mirroring the circuit arithmetic
- [x] Parity tests (TS output == circuit output) per persona
- [x] Browser mirror `src/lib/midnight/score.ts` on the same fixtures
- [x] `maxLoanTermSeconds()` parity, `interestDue`, tier progress, score bands

## Wallet + infra
- [x] Wallet connector integration (connect / address / disconnect)
- [x] Local encrypted private-state store keyed to wallet (AES-GCM)
- [x] Local proof server config + health check
- [x] Message signing + external-wallet ownership challenge
- [x] DUST fee state + pre-flight `assertCanPayFees`
- [x] Submit pipeline driven by the phase machine
- [x] `LendingClient` — one method per circuit
- [x] SDK-free provider foundation (`FetchKeyMaterialProvider`, `queryContractState`)
- [x] `npm run sync:zk` — copies keys + zkir into `public/zk/lending/` (24 files,
  25MB); verified served over HTTP at the paths `FetchKeyMaterialProvider` requests
- [x] **`TxAssembler` implementation — DONE.** `src/lib/midnight/tx-assembler.ts`
  builds real unproven ledger transactions for both `deploy` and every circuit
  call, on `midnight-js-contracts` 5.0.0-beta.7 + `ledger-v9`. The version block
  was real but is gone: 5.0.0-beta.7 depends on `compact-runtime` 0.19.0-rc.0,
  whose dependency set is identical to our 0.19.0.
  - The library does the parts that must be byte-exact with what the chain
    re-derives — transcript partitioning, the `ContractCallPrototype`, and the
    contract key location that embeds the deployed verifier key's hash.
  - Proving is delegated to the **wallet** (`getProvingProvider`), not to a
    standalone proof server, which is why `submitCallTx` from the library is not
    used: that path proves through a `ProofProvider` pointed at a proof server.
  - Tested against the real compiled contract with no network:
    `tx-assembler.test.ts` assembles a deployment, feeds its state back as the
    indexer would, and assembles a real `depositLiquidity` call.
- [x] **Fixed: the old proving step was wrong.** `submit.ts` used to hand the
  serialized transaction to `ProvingProvider.prove()` and treat the result as a
  proven transaction. `prove()` takes a *proof preimage*; the ledger drives it,
  once per contract call, from `Transaction.prove()`. Corrected, and the seam
  narrowed so `submit.ts` never touches ledger types.
- [x] **Fixed: two copies of the WASM runtime.** `contracts/` had its own
  `node_modules`, so the app and the contract package each got their own
  `onchain-runtime-v4` — and a `ContractMaintenanceAuthority` built by one was
  not an `instanceof` the other's. Caught by the first assembler test. The repo
  is now an npm workspace with a `compact-runtime` override, so there is exactly
  one copy of each runtime.
- [x] **`lookupKey` gap bridged.** `ledger-v9`'s `ProvingProvider` requires
  `lookupKey`, which the DApp Connector API v4 does not provide — its provider
  is specified against an older ledger. The key material is our own compiler
  output, so the assembler fills it in rather than blocking on a connector
  revision.
- [x] Live entry point — `src/lib/midnight/live.ts`: `connectLending()` builds a
  `LendingClient` on the real assembler, and `checkLiveReadiness()` pre-flights
  the two things that are ours to get wrong (artifacts served, wallet on the
  right network). The assembler is imported lazily, so demo mode fetches no WASM
  — verified in a browser: zero `.wasm` requests on the demo path.
- [x] **Proving verified for real.** `src/lib/midnight/proof-server-provider.ts`
  is a `ProvingProvider` backed by a self-hosted `midnight-proof-server`, so the
  most expensive step no longer depends on a human clicking through a browser
  extension. `npm run proof-server:up && npm run test:prove` assembles real
  transactions and proves them:
  - `depositLiquidity` — ~0.3s
  - **`borrow` — 3.0s, 5.4KB proven transaction.** This is the number that
    decides whether a live demo is viable, and it is fine. `borrow` verifies
    four Merkle paths and computes the score over private data; its prover key
    is 19MB against 74KB for `depositLiquidity`.
  - Timing has three regimes, and only the last one is what a demo feels:
    a **container with no cached parameters** spends ~50s downloading them
    (`bls_midnight_2p13`, the zswap and dust ZKIR) before it will even answer
    `/health`; the **first `borrow` on a started server** is ~11-13s while the
    19MB key is loaded; **every proof after that is ~3s**. Measured: 53.2s
    (fresh container) → 11.4s (restarted, params cached) → 3.1s → 3.0s.
  - `proof-server:up` now mounts a named volume at
    `/.cache/midnight/zk-params`, so the download happens once per machine
    instead of once per `docker run` — the container is `--rm`, so without it
    every session re-downloaded. Startup dropped 20s → 4s. The volume is shared
    with the sibling project: same parameters.
  - Warm it up before anyone is watching.
  - Proof server `7.0.0-rc.1` works with our `ledger-v9` — it fetches
    `zswap/9/...` parameters, so the generations line up despite the version
    numbers looking unrelated.
- [ ] **Submit to a live network.** Assembly and proving are verified; balancing,
  submission and confirmation are not. Those need the browser wallet: there is
  no headless wallet for this stack (`@midnight-ntwrk/wallet` tops out at 5.0.0
  and still depends on `zswap@4.0.0`, the old separate-zswap architecture),
  so it needs tNIGHT, generated DUST, and a human approving in the extension.

## App / infra
- [x] Next 16 app builds, `tsc --noEmit` clean, vitest wired
- [x] `WalletProvider` in `layout.tsx`; `@/lib/midnight` barrel export
- [x] `src/lib/midnight` + `src/lib/demo` unit tests — 106 cases
- [x] **eslint pass — clean.** Fixed four real findings rather than suppressing:
  a ref written during render, a `setState` in an effect (now
  `useSyncExternalStore` over `window.midnight`), an unused binding, and the
  generated `contracts/src/managed/**` now ignored.
- [x] `@/*` path alias wired into `vitest.config.ts`

## Cross-chain import
- [x] External-wallet ownership proof (nonce-bound EIP-191 challenge)
- [x] **Verify the signature** — real secp256k1 public-key recovery, checked
  against the claimed address; rejects wrong signer, off-message signatures,
  stale and future-dated challenges, and replayed nonces
- [x] **Commit the derived-history hash into private state** — canonical-JSON
  SHA-256 over (chain, address, history, nonce), stored under its own key so the
  circuit-facing state stays an exact mirror of `DefiPrivateState`
- [x] Mock history JSON ingestion, with strict parsing of an untrusted document
- [x] Bounded derivation (age / activity / volume / repayments − liquidations),
  capped at 300 and floored at 0
- [x] Browser signing path: an injected EVM wallet if present, otherwise a
  built-in demo key — a real signature over a real challenge either way, and the
  UI says which was used

## UI
- [x] Landing + connect CTA, wallet panel (address, DUST, proof-server status)
- [x] Proof progress — `ProofProgress` renders the five phases live
- [x] Borrower dashboard: attestation inbox (values local, leaf hashes on-chain)
- [x] Borrower dashboard: link external wallet, with the score breakdown
- [x] Score + tier band display, progress to the next tier
- [x] Borrow form → proof phases → submit, every constraint explained before it fails
- [x] Active loan card (balance, APR, accrued interest, repay, risk meter)
- [x] Pool view: liquidity, tier rules, outstanding loans, deposit/withdraw, liquidate
- [x] Explorer panel (chain-sees vs you-know, side by side)
- [x] Hash-routed tabs so a view can be linked to during a walkthrough

## Demo
- [x] Seed script for pool liquidity + personas — `npm run seed`
- [x] End-to-end demo run: identical collateral, 3x borrow delta — `npm run demo`,
  against the real compiled circuits
- [x] Default → liquidation reveals only Bob
- [x] `test/demo.test.ts` pins the narrative so it cannot rot silently
- [x] Browser demo verified end to end in headless Chrome: link wallet → score
  500→619 → borrow → 3x delta → advance clock → liquidate → one defaulter

## Open questions
- [ ] Which Midnight wallet for the demo (Lace / 1AM)?
- [ ] Local proof server perf — acceptable for a live demo?
- [ ] Collateral asset — native token or a mock token?
- [ ] Default condition — currently time-based (`dueTime`); an oracle would be better
- [ ] Testnet faucet + DUST availability for demo accounts

## Known gaps, stated plainly
- **Nothing has been submitted to a network.** Assembly and proving are both
  verified against real components — the compiled contract and a real proof
  server. What has never run is balancing, submission and confirmation, which
  require a funded wallet in a browser. The remaining risk sits entirely in that
  last hop.
- Building the app now requires the contract to be compiled first
  (`npm run compact`), because the assembler imports the generated bindings.
  `npm run sync:zk` is still needed to serve the keys.
- The browser demo runs its own in-memory ledger (`src/lib/demo/engine.ts`) and
  paces the proof phases rather than computing them. It mirrors the circuit's
  asserts in the same order with the same messages, and its rules are unit-tested
  against the same fixtures as the contract — but the authority is
  `npm --prefix contracts run demo`, which executes the real circuits.
- Demo-mode hashing is SHA-256, not the circuit's `persistentHash`. Same shape
  and same unlinkability; different bytes.
- The issuer is trusted for all four attestation fields, by design for an MVP.
  A real deployment wants issuer signatures per leaf and multiple issuers.
- Interest is computed and displayed but not enforced on-chain: `repay` requires
  `amount >= principal`, not principal + interest.
