// Nocturne — the cross-chain linking flow (plan.md §4), as a pure function.
//
// Lives outside the React provider so the interesting part is testable without
// a DOM: challenge -> signature -> secp256k1 recovery -> bounded score -> the
// attestation the *oracle* mints.
//
// The last step is the one that matters. The borrower proves they control an
// address; the oracle decides what that history is worth and publishes a leaf.
// If the borrower could publish it, `crossChainAttestation` would be an
// unconstrained witness again and any borrower could self-award any score.

import {
  externalChallengeMessage,
  externalOwnershipChallenge,
  importCrossChainHistory,
  MAX_CROSS_CHAIN_SCORE,
  OwnershipError,
  type ExternalChallenge,
  type ExternalHistory,
  type LinkedWallet,
} from "@/lib/midnight/cross-chain";
import type { Attestation } from "@/lib/midnight/score";

export type SignatureSource = "injected" | "demo-key";

/**
 * Produce an EIP-191 signature over the challenge. `buildMessage` is handed the
 * address the signer actually used, because an injected wallet chooses its own
 * account and the challenge must bind that one.
 */
export type ChallengeSigner = (
  challenge: ExternalChallenge,
  buildMessage: (address: string) => string,
) => Promise<{ address: string; signature: string; source: SignatureSource }>;

export type LinkOutcome = {
  linked: LinkedWallet;
  /** What the oracle mints for the subject once the proof checks out. */
  attestation: Attestation;
  source: SignatureSource;
};

export type LinkFlowOptions = {
  history: ExternalHistory;
  /** Demo block time, unix seconds. */
  now: number;
  /** Life of the minted attestation, unix seconds. */
  expiry: bigint;
  sign: ChallengeSigner;
};

export async function runLinkFlow({
  history,
  now,
  expiry,
  sign,
}: LinkFlowOptions): Promise<LinkOutcome> {
  const seed = externalOwnershipChallenge(history.address, history.chain);
  const buildMessage = (address: string) =>
    externalChallengeMessage(address, history.chain, seed.nonce, now);

  // Date the challenge to the demo clock so the TTL check measures the thing it
  // is meant to measure.
  const challenge: ExternalChallenge = {
    ...seed,
    issuedAt: now,
    message: buildMessage(history.address),
  };

  const signed = await sign(challenge, buildMessage);

  const bound: ExternalChallenge = {
    ...challenge,
    address: signed.address,
    message: buildMessage(signed.address),
  };

  const linked = importCrossChainHistory(
    { challenge: bound, signature: signed.signature },
    { ...history, address: signed.address },
    now,
  );

  if (linked.derivedScore > MAX_CROSS_CHAIN_SCORE) {
    // Unreachable — `deriveCrossChainScore` clamps. Kept because the invariant
    // is what stops this path from becoming a score faucet.
    throw new OwnershipError(
      `derived score ${linked.derivedScore} exceeds the cap of ${MAX_CROSS_CHAIN_SCORE}`,
    );
  }

  return {
    linked,
    attestation: { value: linked.derivedScore, expiry },
    source: signed.source,
  };
}
