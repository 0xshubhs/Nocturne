// defi1 — message signing via the DApp Connector API.
//
// Used for two things:
//   1. proving ownership of an external wallet before its history is committed
//      to private state (plan.md §4);
//   2. deriving the encrypted-store key (see private-state.ts).
//
// The connector prepends its own prefix before signing, so a signature here is
// not a valid transaction signature — it only proves control of the unshielded
// key.

import type { ConnectedAPI, Signature } from "@midnight-ntwrk/dapp-connector-api";

export type SignedMessage = {
  message: string;
  signature: string;
  verifyingKey: string;
};

/** Sign a UTF-8 string with the wallet's unshielded key. */
export async function signMessage(api: ConnectedAPI, message: string): Promise<SignedMessage> {
  const sig: Signature = await api.signData(message, { encoding: "text", keyType: "unshielded" });
  return { message, signature: sig.signature, verifyingKey: sig.verifyingKey };
}

/**
 * Ask the connected wallet to sign a challenge that binds an external address to
 * this session. The verifier (contract or client) checks the signature against
 * `verifyingKey` and that `message` contains the expected external address +
 * nonce.
 */
export async function proveExternalWalletOwnership(
  api: ConnectedAPI,
  externalAddress: string,
  nonce: string,
): Promise<SignedMessage> {
  const message = `defi1: I control ${externalAddress} — nonce ${nonce}`;
  return signMessage(api, message);
}

export function ownershipChallenge(externalAddress: string): { message: string; nonce: string } {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const nonceHex = Array.from(nonce, (b) => b.toString(16).padStart(2, "0")).join("");
  return { message: `defi1: I control ${externalAddress} — nonce ${nonceHex}`, nonce: nonceHex };
}
