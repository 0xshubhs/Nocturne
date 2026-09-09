# defi1 — contracts

Core Compact contract for the ZK under-collateralized lending pool.

```
src/
  lending.compact   core contract
  witnesses.ts      private state shape + witness implementations
  score.ts          TS reference for the score arithmetic (parity target)
test/               (todo) contract + parity tests
```

## Build

Needs the Midnight Compact toolchain — **not installed on this machine yet**, so
nothing here is compiled or tested.

```bash
curl --proto '=https' --tlsv1.2 -sSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
source $HOME/.local/bin/env

compact compile src/lending.compact src/managed/lending
```

Target: Compact **>= 0.23**, compact-runtime 0.16.x, Node >= 22, proof server
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

## Still open (need the compiler)

- `path.leaf` accessor + `merkleTreePathRoot` arity — confirm against runtime
  (fallback forms noted in `verifiedValue`).
- No block-time getter on Midnight: `borrow` takes `dueTime` and only asserts it
  is in the future (`blockTimeLt`). A relative term cap needs an oracle/keeper.
- `?:` on struct values (`useTier1 ? tier1 : tier0`) — verify Compact allows it;
  else branch explicitly.
- Contract tests + `score.ts` ↔ circuit parity tests.

See `../pending.md` → Core contract.
