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
consumes a **nullifier** so one identity cannot stack loans, bounds `dueTime` to
90 days so no loan is unliquidatable, and binds every attestation — including
the cross-chain contribution — to an issuer-published Merkle leaf so a borrower
cannot fabricate inputs. `liquidate` is the only circuit that reveals an
identity, and it reveals nothing else.

Tier 0 lends at 50% LTV, tier 1 at 150%. Two borrowers posting **identical
collateral** therefore differ 3x in what they can take, and the ledger records
only that one of them cleared a higher threshold.

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
  src/issuer.ts             mock attestation issuer + cross-chain oracle
  scripts/mint-personas.ts  CLI: mint the demo attestation set
  scripts/seed.ts           CLI: seed pool liquidity + personas, emit a bundle
  scripts/demo.ts           CLI: the full demo narrative, on the real circuits
  test/                     in-memory simulator + behavioural & parity suites
src/
  lib/midnight/             Midnight integration layer (see below)
  lib/demo/                 in-browser ledger, personas, EVM signer, link flow
  components/               dashboard, pool view, explorer panel, UI primitives
  app/                      Next.js App Router pages
```

### Contract (`contracts/`)

Compiles under Compact ≥ 0.23 (`compact` 0.5.2 / compiler 0.34.0),
`compact-runtime` 0.19. Circuits: `issueAttestation`, `depositLiquidity`,
`withdrawLiquidity`, `borrow`, `repay`, `liquidate`.

```bash
cd contracts
npm install
npm run compact        # compile -> src/managed/lending  (full ZK, ~20s)
npm run check          # tsc --noEmit && vitest run   (45 tests)
npm run issuer:mint    # mint the demo attestation set for Alice + Bob
npm run seed           # seed pool liquidity + personas, emit the bundle
npm run demo           # the full demo narrative, narrated
```

Test coverage: score thresholds, the cross-chain contribution and the rejection
of a self-asserted one, expired attestations, LTV boundary conditions, the
90-day term cap at both edges, double-borrow rejection, the liquidation
disclosure surface, TS↔circuit parity for score and term cap on every demo
persona, the issuer end to end (issue → borrow, unissued attestation rejected),
and the demo narrative itself.

### The demo

```bash
npm --prefix contracts run demo
```

Seeds a pool, mints attestations for Alice (strong file) and Bob (thin file),
has both post **1,000 collateral**, and shows Alice draw 1,500 against Bob's
500 — while the ledger holds nothing but two nullifiers, two tiers and two
amounts. Bob then defaults, and liquidation discloses exactly one 32-byte
nullifier and nothing else. `contracts/test/demo.test.ts` asserts every step of
that story so it cannot rot quietly.

### Midnight integration (`src/lib/midnight/`)

| Module | Responsibility |
|---|---|
| `config` | network endpoints per `NetworkId`; merges the wallet's reported service URIs over defaults |
| `connector` | DApp Connector API — enumerate injected wallets, connect, read the unshielded address, connection status, DUST balance |
| `private-state` | `EncryptedPrivateStateStore` — AES-GCM at rest, key derived from a wallet signature so only the owning wallet can decrypt |
| `codec` | JSON encoding that preserves `bigint` and `Uint8Array` |
| `lending` | borrower private-state shape (mirrors the contract) + a typed store wrapper, plus linked-wallet records under their own key |
| `score` | browser mirror of the score, tier table, LTV, term cap and interest |
| `cross-chain` | nonce-bound EIP-191 challenge, secp256k1 recovery, bounded score derivation, history commitment, untrusted-document parsing |
| `signing` | message signing + an external-wallet ownership challenge |
| `fees` | DUST fee state and a pre-flight `assertCanPayFees` check |
| `proof-server` | proof-server health check and the `building → proving → balancing → submitting → confirming` progress machine |
| `providers` | SDK-free foundation: serves compiled ZK assets to the wallet's prover, reads contract state from the indexer |
| `submit` | the `fee check → assemble → prove → balance → submit → confirm` pipeline |
| `lending-client` | `LendingClient` — one method per circuit, composing private state + assembler + submit |
| `use-wallet` | React `WalletProvider` / `useWallet()` |

### Transaction assembly (`tx-assembler.ts`)

`submit.ts` takes a `TxAssembler`; `MidnightTxAssembler` is the real one, built
on `midnight-js-contracts` 5.0.0-beta.7 and `ledger-v9`. It assembles both
deployments and circuit calls:

1. read the deployed contract state from the indexer;
2. run the circuit locally against it, producing the call trace;
3. partition the transcript, build a `ContractCallPrototype`, and pack it into
   an unproven `Transaction` — the library's job, because this has to be
   byte-exact with what the chain re-derives;
4. prove it **through the wallet** (`getProvingProvider`), not a standalone
   proof server;
5. balance, pay DUST, submit — the wallet again.

Step 4 is why the library's own `submitCallTx` is not used: that path proves
through a `ProofProvider` pointed at a proof server, whereas a connector-based
DApp should let the wallet prove so the user's keys and proving preferences stay
in the wallet.

Two gaps had to be bridged along the way. `ledger-v9`'s `ProvingProvider`
requires a `lookupKey` that the DApp Connector API v4 does not define — its
provider is specified against an older ledger — so the assembler supplies it
from our own compiler output. And the wallet's prover is handed a *contract key
location*, not a circuit name, so `FetchKeyMaterialProvider` parses it; left
unparsed it would 404 several minutes into a proof.

Going on-chain:

```ts
const client = await connectLending({ api, address, config });
const { contractAddress } = await client.deploy(issuerSecret, onProgress);
await client.depositLiquidity(1_000_000n, onProgress);
```

`checkLiveReadiness(api, config)` pre-flights the two things that are ours to
get wrong: that the ZK artifacts are being served, and that the wallet is on the
network the app targets.

**Not yet run against a live network.** Assembly is exercised against the real
compiled contract in `tx-assembler.test.ts` — a real deployment, a real
`depositLiquidity` call, real transcript partitioning — but nothing has been
proven by a wallet, submitted, or confirmed on preprod. Proving is the one step
a test cannot stand in for: the ledger's WASM traps rather than throwing when
handed an invalid proof, so the tests stop deliberately short of it.

### Demo mode (`src/lib/demo/`)

The UI runs against an in-browser ledger that mirrors the contract's state
transitions — same asserts, same order, same error messages — so the whole
borrower and lender flow is clickable with no node, no proof server and no
wallet. Two differences from the chain, both deliberate and both marked in the
source: hashing is SHA-256 rather than the circuit's `persistentHash`, and the
proof phases are paced rather than computed. The authority on contract behaviour
is the contract suite; this is the part you can run on a laptop.

---

## Status

| Milestone (`plan.md`) | State |
|---|---|
| §1 Core contract | **Done** — compiles with full ZK keys, 45 tests green |
| §2 Attestation issuer | **Done** — `AttestationIssuer`, cross-chain oracle, persona-mint CLI |
| §3 Wallet integration | **Done** — connector, encrypted state, signing, DUST fees, prove→pay→submit pipeline, `LendingClient`, and real transaction assembly for deploys and calls |
| §4 Cross-chain import | **Done** — real secp256k1 ownership proof, bounded derivation, committed history hash |
| §5 Scoring engine | **Done** — TS reference + circuit parity, mirrored for the browser |
| §6 UI | **Done** — borrower dashboard, borrow/repay, pool view, explorer panel |
| §7 Demo | **Done** — seed + narrated CLI run, and the same story in the browser |

**7 of 7 milestones complete, plus transaction assembly.** 168 tests green
(123 app + 45 contracts), `tsc` clean in both packages, `eslint` clean,
`next build` green.

### Two fixes worth calling out

**The cross-chain score was forgeable.** `crossChainScore` was an unconstrained
witness — a borrower controls their own witness implementation, so they could
return `10^18` and clear any tier. It is now a fourth attestation field verified
through the same Merkle path as the other three: the oracle checks an ownership
proof, derives a capped contribution, and publishes the leaf. Every subject is
onboarded with a zero-valued leaf so a borrower who has linked nothing still has
a path to prove. Both directions are regression-tested.

**Loans could be made unliquidatable.** `borrow` only asserted `dueTime` was in
the future, so a borrower could set it to the year 3000. Compact exposes no
block-time getter, only `blockTimeLt` / `blockTimeGte`, so the cap is expressed
as a second comparison: `due - maxLoanTermSeconds()` must already be in the
past, which is exactly `due ≤ now + 90 days`.

---

## Getting started

```bash
npm install
npm --prefix contracts run compact   # required: the app imports the bindings
npm run sync:zk                      # serve the proving/verifier keys
npm run dev        # http://localhost:3000
npm test           # 123 unit tests
npm run typecheck
npm run lint
npm run build
```

The UI opens in demo mode and needs no wallet: pick Alice or Bob in the header,
link Bob's external wallet to watch his score move, borrow, advance the clock,
and liquidate. The **Explorer** tab puts the public ledger and the device's
private state side by side — that is the whole argument in one screen.

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

1. Deploy to preprod and drive the live path end to end — the assembler is
   written and tested offline, but proving, balancing and submission have never
   run against a real wallet and node.
2. Enforce interest on-chain: `repay` currently requires `amount >= principal`,
   not principal + accrued interest.
3. Issuer signatures per leaf, and more than one issuer.
4. Oracle-driven default conditions instead of a fixed `dueTime`.
5. More than two tiers, or a continuous LTV curve.
