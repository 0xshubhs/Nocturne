// Nocturne — signing the cross-chain ownership challenge.
//
// Two paths, both producing a signature that goes through the *same*
// `verifyExternalOwnership` recovery in `lib/midnight/cross-chain.ts`:
//
//   · A real injected EVM wallet (`window.ethereum`), via `personal_sign`.
//     This is what a user would actually do.
//   · A built-in demo key, for when no wallet is installed. The key is real
//     secp256k1 and the signature is a real EIP-191 signature — only its
//     custody is fake. Nothing about the verification path is stubbed.
//
// The UI says which one was used, because "we signed it for you" and "you
// signed it" are very different claims.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { personalSignDigest } from "@/lib/midnight/cross-chain";

/** A fixed key so the demo address is stable across reloads. Not a secret. */
const DEMO_PRIVATE_KEY = new Uint8Array(32).fill(0x2b);

function addressOf(privateKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privateKey, false);
  return `0x${bytesToHex(keccak_256(pub.slice(1)).slice(-20))}`;
}

/** The address the built-in demo signer controls. */
export const DEMO_EVM_ADDRESS: string = addressOf(DEMO_PRIVATE_KEY);

/**
 * Sign a message the way a wallet's `personal_sign` does: EIP-191 digest,
 * 65-byte r‖s‖v with v offset by 27.
 */
export function demoPersonalSign(message: string): string {
  const digest = personalSignDigest(message);
  // noble returns v‖r‖s for the recovered format; wallets return r‖s‖v.
  const recovered = secp256k1.sign(digest, DEMO_PRIVATE_KEY, { prehash: false, format: "recovered" });
  const v = recovered[0];
  const rs = recovered.slice(1);
  return `0x${bytesToHex(rs)}${(v + 27).toString(16).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Injected wallet
// ---------------------------------------------------------------------------

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function injected(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function hasInjectedWallet(): boolean {
  return injected() !== null;
}

export type SignerResult = {
  address: string;
  signature: string;
  /** Whether a real wallet signed, or the built-in demo key did. */
  source: "injected" | "demo-key";
};

/**
 * Ask an injected wallet for an account and a `personal_sign` over `message`.
 * Throws if no wallet is present or the user rejects.
 */
export async function signWithInjectedWallet(
  message: string,
  buildMessage?: (address: string) => string,
): Promise<SignerResult> {
  const eth = injected();
  if (!eth) throw new Error("no injected EVM wallet found");

  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("the wallet returned no account");

  // The challenge binds the address, so it can only be built once we know it.
  const toSign = buildMessage ? buildMessage(address) : message;
  const signature = (await eth.request({
    method: "personal_sign",
    params: [toSign, address],
  })) as string;

  return { address, signature, source: "injected" };
}
