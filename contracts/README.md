# defi1 — contracts

Core Compact contract for the ZK under-collateralized lending pool.

```
src/
  lending.compact   core contract
  witnesses.ts      private state shape + witness implementations
  score.ts          TS reference for the score arithmetic (parity target)
test/
  simulator.ts            in-memory contract runner (no proof server)
  lending.test.ts         behavioural suite (14 cases)
  score.parity.test.ts    score.ts <-> scoreOf circuit parity (6 cases)
```

## Build + test

Compiles under the Midnight Compact toolchain (`compact 0.5.2`, compiler
0.34.0). `src/managed/` is generated and git-ignored.

```bash
# one-time: install the compiler
curl --proto '=https' --tlsv1.2 -sSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source $HOME/.local/bin/env

npm install
npm run compact        # compile src/lending.compact -> src/managed/lending
npm run check          # tsc --noEmit && vitest run  (20 tests)
```

Target: Compact **>= 0.23**, compact-runtime 0.19.0, Node >= 22, proof server
`midnightntwrk/proof-server:8.0.3`.

## Contract shape

- **Public ledger**: `issuerPk` (sealed), `attestationRoot` (HistoricMerkleTree),
  `poolLiquidity`, `tier0`/`tier1`, `loans` (keyed by nullifier), `activeNullifiers`,
  `loanCount`, `defaulters`.
- **Private witnesses**: `callerSecret`, three attestations `(value, expiry, Merkle
  path)`, `crossChainScore`.
- **Trust anchor**: the mock issuer calls `issueAttestation(leaf)`; a borrower
  proves each attestation leaf is in `attestationRoot` via a witness Merkle path,
  and that the leaf binds to the claimed `(value, expiry, subject)`.
- **Disclosure surface**:
  - `borrow` → nullifier, tier, principal, collateral, and `score >= tier`
    (boolean). Never the score, the raw attestations, or an identity.
  - `liquidate` → the defaulter's nullifier only. Nothing else.

## Applied from ../../REVIEW.md

| Item | Done |
|---|---|
| S1 pragma 0.15 → **>= 0.23** | ✅ |
| S2 struct fields comma-separated | ✅ |
| S5 explicit `as Uint<64>` on ledger arithmetic | ✅ |
| S7 no loops / no `return` in loops (attestations are 3 explicit checks) | ✅ |
| S8 witness declarations grouped up top | ✅ |
| C1 attestations validated against issuer Merkle root | ✅ |
| C2 domain-separated `makeNullifier` / `makeSubjectId` / `deriveIssuerPk` | ✅ |
| C3 loans keyed by nullifier (pseudonymous); amounts intentionally public per pitch | ✅ |

## Confirmed against the compiler

- `path.leaf` accessor + `merkleTreePathRoot<10, Bytes<32>>` — compile + the
  Merkle-path check in `verifiedValue` passes in the test suite.
- `?:` returning a struct (`t1 ? tier1 : tier0`) — allowed, works.
- `blockTimeLt` / `blockTimeGte` — drive `borrow`'s due-in-future check and
  `liquidate`'s default check; the simulator threads block time.

## Still open

- No block-time getter on Midnight: `borrow` takes `dueTime` and only asserts it
  is in the future. A relative term cap needs an oracle/keeper.
- Proving keys are generated locally; wire a proof server for real proofs.

See `../pending.md` → Core contract.
