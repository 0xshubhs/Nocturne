# defi1 — contracts

Core Compact contract for the ZK under-collateralized lending pool.

```
src/
  lending.compact   core contract (ledger state + scoring + borrow/repay/liquidate)
  witnesses.ts      private state shape + witness implementations
  score.ts          TS reference for computeScore (parity target)
test/               (todo) contract + parity tests
```

## Build

Needs the Midnight Compact toolchain (`compactc`) — not yet installed on this
machine.

```bash
# install the compiler (see Midnight docs for the current channel)
npm i -D @midnight-ntwrk/compact

# compile the contract -> ./managed/lending
compactc src/lending.compact managed/lending
```

The compiler emits a typed TS module. Wire `witnesses.ts` into its witness
object and call circuits from the dApp (plan.md §3, §6).

## Contract shape

- **Public ledger**: `poolLiquidity`, `tierRules` (2 tiers), `loanCommitments`,
  `usedNullifiers`, `loanCount`, `issuerPubKey`.
- **Private witnesses**: borrower identity secret, held attestations,
  cross-chain score, per-loan salt, collateral.
- **Disclosure surface**:
  - `borrow` reveals a loan commitment, a nullifier, the tier, the amount — and
    the boolean `score >= tier`. Never the borrower, collateral, or score.
  - `liquidate` is the only circuit that reveals an identity, and reveals
    nothing else.

## Status

See `../pending.md` → Core contract. Not compiled or tested yet — no toolchain.
Syntax targets Compact ~0.15 and may need surface adjustments for the installed
compiler.
