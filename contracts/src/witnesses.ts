// defi1 — private state + witness implementations for lending.compact
//
// These callbacks supply the private (witness) inputs at proving time. They run
// locally in the caller's client and never leave the device. The attestation
// witnesses recompute the exact leaf the circuit expects (via the generated
// pure circuits) and pull its Merkle path from the on-chain attestation tree.

import { pureCircuits, type Ledger, type Witnesses } from "./managed/lending/contract/index.js";

type WitnessContext = { ledger: Ledger; privateState: DefiPrivateState; contractAddress: string };
// The circuit needs a concrete path; `findPathForLeaf` returns `undefined` when
// the leaf was never issued, which we treat as a hard error (see below).
type MerklePath = NonNullable<ReturnType<Ledger["attestationRoot"]["findPathForLeaf"]>>;

// One raw attestation the caller holds locally.
export type Attestation = {
  value: bigint; // bucketed value, never the raw figure
  expiry: bigint; // unix seconds
};

// Everything the borrower stores locally, encrypted at rest, keyed to the wallet.
//
// `crossChain` is an attestation like any other: the issuer, acting as the
// cross-chain oracle, mints it after checking an external-wallet ownership
// proof. A borrower who has linked nothing holds the zero-valued leaf minted
// at onboarding.
export type DefiPrivateState = {
  callerSecret: Uint8Array; // 32 bytes, long-lived identity secret
  bank?: Attestation;
  salary?: Attestation;
  repay?: Attestation;
  crossChain?: Attestation;
};

const ZERO_ATT: Attestation = { value: 0n, expiry: 0n };

// domain separators — must match lending.compact
export const FIELD_TAG = {
  bank: pad32("defi1:att:bank:v1"),
  salary: pad32("defi1:att:salary:v1"),
  repay: pad32("defi1:att:repay:v1"),
  crossChain: pad32("defi1:att:crosschain:v1"),
} as const;

export function pad32(s: string): Uint8Array {
  const b = new Uint8Array(32);
  b.set(new TextEncoder().encode(s));
  return b;
}

/** The leaf the issuer commits for an attestation about `subject`. */
export function attestationLeaf(
  fieldTag: Uint8Array,
  att: Attestation,
  subject: Uint8Array,
): Uint8Array {
  return pureCircuits.attestationLeaf(fieldTag, att.value, att.expiry, subject);
}

function attestationWitness(fieldTag: Uint8Array, pick: (ps: DefiPrivateState) => Attestation | undefined) {
  return (ctx: WitnessContext): [DefiPrivateState, [bigint, bigint, MerklePath]] => {
    const att = pick(ctx.privateState) ?? ZERO_ATT;
    const subject = pureCircuits.makeSubjectId(ctx.privateState.callerSecret);
    const leaf = attestationLeaf(fieldTag, att, subject);
    const path = ctx.ledger.attestationRoot.findPathForLeaf(leaf);
    if (path === undefined) {
      throw new Error(
        "attestation leaf not found in the issuer tree — the issuer has not attested this (field, value, expiry) for this identity",
      );
    }
    return [ctx.privateState, [att.value, att.expiry, path]];
  };
}

export const witnesses: Witnesses<DefiPrivateState> = {
  callerSecret: (ctx: WitnessContext): [DefiPrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.callerSecret,
  ],
  bankAttestation: attestationWitness(FIELD_TAG.bank, (ps) => ps.bank),
  salaryAttestation: attestationWitness(FIELD_TAG.salary, (ps) => ps.salary),
  repayAttestation: attestationWitness(FIELD_TAG.repay, (ps) => ps.repay),
  crossChainAttestation: attestationWitness(FIELD_TAG.crossChain, (ps) => ps.crossChain),
};

export function emptyPrivateState(secretKey: Uint8Array): DefiPrivateState {
  return { callerSecret: secretKey };
}
