// defi1 — private state + witness implementations for lending.compact
//
// The Compact compiler generates a typed contract module from lending.compact.
// These callbacks supply the private (witness) inputs at proving time. They run
// locally in the caller's client and never leave the device.
//
// Types (`WitnessContext`, `MerkleTreePath`) come from the generated module /
// @midnight-ntwrk/compact-runtime once the contract is compiled — imported here
// as `any` placeholders until then.

type WitnessContext<PS> = { privateState: PS; ledger: any };
type MerkleTreePath = unknown;

// One raw attestation the caller holds locally.
export type Attestation = {
  value: bigint; // bucketed value, never the raw figure
  expiry: bigint; // unix seconds
};

// Everything the borrower stores locally, encrypted at rest, keyed to the wallet.
export type DefiPrivateState = {
  callerSecret: Uint8Array; // 32 bytes, long-lived identity secret
  bank?: Attestation;
  salary?: Attestation;
  repay?: Attestation;
  crossChainScore: bigint; // score contributed by verified external wallets
};

const ZERO_ATT: Attestation = { value: 0n, expiry: 0n };

// domain separators — must match lending.compact
const DOM = {
  bank: "defi1:att:bank:v1",
  salary: "defi1:att:salary:v1",
  repay: "defi1:att:repay:v1",
} as const;

// Recompute the leaf the issuer committed, then ask the on-chain attestation
// tree for its Merkle path. `leafFor` must mirror `attestationLeaf` in the
// contract — wired up once the generated `pureCircuits` are available.
function pathFor(
  ctx: WitnessContext<DefiPrivateState>,
  _domain: string,
  _att: Attestation,
): MerkleTreePath {
  // return ctx.ledger.attestationRoot.findPathForLeaf(leafFor(_domain, _att, subjectId));
  return ctx.ledger.attestationRoot.findPathForLeaf(/* leaf */ undefined);
}

export const witnesses = {
  callerSecret: (
    ctx: WitnessContext<DefiPrivateState>,
  ): [DefiPrivateState, Uint8Array] => [ctx.privateState, ctx.privateState.callerSecret],

  bankAttestation: (
    ctx: WitnessContext<DefiPrivateState>,
  ): [DefiPrivateState, [bigint, bigint, MerkleTreePath]] => {
    const a = ctx.privateState.bank ?? ZERO_ATT;
    return [ctx.privateState, [a.value, a.expiry, pathFor(ctx, DOM.bank, a)]];
  },

  salaryAttestation: (
    ctx: WitnessContext<DefiPrivateState>,
  ): [DefiPrivateState, [bigint, bigint, MerkleTreePath]] => {
    const a = ctx.privateState.salary ?? ZERO_ATT;
    return [ctx.privateState, [a.value, a.expiry, pathFor(ctx, DOM.salary, a)]];
  },

  repayAttestation: (
    ctx: WitnessContext<DefiPrivateState>,
  ): [DefiPrivateState, [bigint, bigint, MerkleTreePath]] => {
    const a = ctx.privateState.repay ?? ZERO_ATT;
    return [ctx.privateState, [a.value, a.expiry, pathFor(ctx, DOM.repay, a)]];
  },

  crossChainScore: (
    ctx: WitnessContext<DefiPrivateState>,
  ): [DefiPrivateState, bigint] => [ctx.privateState, ctx.privateState.crossChainScore],
};

export function emptyPrivateState(secretKey: Uint8Array): DefiPrivateState {
  return { callerSecret: secretKey, crossChainScore: 0n };
}

// TODO(wallet): load/persist DefiPrivateState through the Midnight private state
// provider once the wallet connector lands (plan.md §3).
