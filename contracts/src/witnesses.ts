// defi1 — private state + witness implementations for lending.compact
//
// The Compact compiler generates a typed contract module from lending.compact.
// These functions supply the private (witness) inputs at proving time. They run
// locally in the borrower's client and never leave the device.

export type Attestation = {
  field: bigint; // 0 = bank balance band, 1 = salary band, 2 = repayment history
  value: bigint; // bucketed value
  expiry: bigint; // unix seconds
  issuer: Uint8Array; // 32 bytes; zero => empty slot
};

// Everything the borrower stores locally, encrypted at rest, keyed to the wallet.
export type DefiPrivateState = {
  borrowerSecretKey: Uint8Array; // 32 bytes, long-lived identity secret
  attestations: Attestation[]; // held attestations (padded to 4 in-circuit)
  crossChainScore: bigint; // score contributed by verified external wallets
  loanSalt: Uint8Array; // 32 bytes, per-loan randomness
  activeLoan?: {
    amount: bigint;
    collateral: bigint;
    salt: Uint8Array;
  };
};

const ZERO32 = new Uint8Array(32);

function padAttestations(atts: Attestation[]): Attestation[] {
  const out = atts.slice(0, 4);
  while (out.length < 4) {
    out.push({ field: 0n, value: 0n, expiry: 0n, issuer: ZERO32 });
  }
  return out;
}

// Wire these into the generated contract's witness object.
export const witnesses = {
  borrowerSecretKey: (ps: DefiPrivateState): [DefiPrivateState, Uint8Array] => [
    ps,
    ps.borrowerSecretKey,
  ],

  attestations: (ps: DefiPrivateState): [DefiPrivateState, Attestation[]] => [
    ps,
    padAttestations(ps.attestations),
  ],

  crossChainScore: (ps: DefiPrivateState): [DefiPrivateState, bigint] => [
    ps,
    ps.crossChainScore,
  ],

  loanSalt: (ps: DefiPrivateState): [DefiPrivateState, Uint8Array] => [
    ps,
    ps.activeLoan?.salt ?? ps.loanSalt,
  ],

  witnessCollateral: (ps: DefiPrivateState): [DefiPrivateState, bigint] => [
    ps,
    ps.activeLoan?.collateral ?? 0n,
  ],
};

// TODO(wallet): load/persist DefiPrivateState through the Midnight private state
// provider once the wallet connector lands (plan.md §3).
export function emptyPrivateState(secretKey: Uint8Array): DefiPrivateState {
  return {
    borrowerSecretKey: secretKey,
    attestations: [],
    crossChainScore: 0n,
    loanSalt: ZERO32,
  };
}
