// Nocturne — DUST fee state.
//
// DUST is the non-transferable resource that pays for every transaction. It
// regenerates over time from staked NIGHT up to a cap. We surface enough for
// the UI to warn before a submit, without echoing the amount into any circuit
// input or ledger write.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";

export type FeeState = {
  /** Current spendable DUST. */
  balance: bigint;
  /** Maximum DUST the wallet's NIGHT can generate. */
  cap: bigint;
  /** Fraction of the cap currently available, 0..1. */
  headroom: number;
  /** Whether `balance` clears our conservative per-proof estimate. */
  sufficient: boolean;
};

/**
 * Conservative estimate of the DUST a single proven contract call costs on
 * preprod. Real cost is computed by the wallet during balancing; this is only
 * for a pre-flight warning.
 */
export const ESTIMATED_CALL_FEE = 1_000_000n;

export async function readFeeState(
  api: ConnectedAPI,
  estimate: bigint = ESTIMATED_CALL_FEE,
): Promise<FeeState> {
  const { balance, cap } = await api.getDustBalance();
  return {
    balance,
    cap,
    headroom: cap > 0n ? Number((balance * 10_000n) / cap) / 10_000 : 0,
    sufficient: balance >= estimate,
  };
}

export function assertCanPayFees(state: FeeState): void {
  if (!state.sufficient) {
    throw new Error(
      `not enough DUST for fees (have ${state.balance}, need ~${ESTIMATED_CALL_FEE}). ` +
        "DUST regenerates from staked NIGHT over a few minutes.",
    );
  }
}
