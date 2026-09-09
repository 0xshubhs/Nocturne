// defi1 — cross-chain history import (plan.md §4).
//
// The flow, end to end:
//
//   1. The borrower names an external wallet they claim to control.
//   2. `externalOwnershipChallenge` mints a nonce-bound message; the borrower signs it
//      *with the external wallet* (MetaMask `personal_sign`, or any EIP-191
//      signer).
//   3. `verifyExternalOwnership` recovers the signer address from the signature
//      and checks it is the claimed address, that the message is the one we
//      issued, and that the nonce has not gone stale. This is real secp256k1
//      recovery, not a shape check.
//   4. `deriveCrossChainScore` turns a history document into a bounded score
//      contribution, and `historyCommitment` binds (address, history, nonce)
//      into a single hash.
//   5. The commitment goes into the borrower's encrypted private state; the
//      derived score goes to the issuer/oracle, which mints a `crossChain`
//      attestation for the subject. The borrower cannot mint it — an
//      unconstrained witness here would let anyone self-award a score.
//
// The MVP accepts a signed history *document* for one external chain. A
// production version would have the oracle fetch the history itself; the shape
// of everything downstream is the same.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export type ExternalChain = "ethereum" | "base" | "arbitrum" | "optimism";

export const EXTERNAL_CHAINS: readonly ExternalChain[] = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
] as const;

/**
 * The mocked history document a borrower imports. Every field is something a
 * public indexer could derive from an address without any private data.
 */
export type ExternalHistory = {
  chain: ExternalChain;
  /** Checksummed or lowercase 0x address. Compared case-insensitively. */
  address: string;
  /** Unix seconds of the address's first outbound transaction. */
  firstActivityUnix: number;
  /** Lifetime transaction count. */
  txCount: number;
  /** Distinct months with at least one transaction. */
  activeMonths: number;
  /** Loans fully repaid on lending protocols. */
  loansRepaid: number;
  /** Loans liquidated out from under them. */
  loansLiquidated: number;
};

/**
 * Ceiling on what a verified external wallet can contribute, mirroring
 * `MAX_CROSS_CHAIN_SCORE` in contracts/src/issuer.ts. The issuer enforces it
 * when minting; this is the client-side mirror so the UI can show the cap.
 */
export const MAX_CROSS_CHAIN_SCORE = 300n;

/** How long an ownership challenge stays valid. */
export const CHALLENGE_TTL_SECONDS = 600;

export class OwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnershipError";
  }
}

// ---------------------------------------------------------------------------
// Challenge + verification
// ---------------------------------------------------------------------------

export type ExternalChallenge = {
  address: string;
  chain: ExternalChain;
  nonce: string;
  issuedAt: number;
  message: string;
};

function randomNonce(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * The exact message the external wallet must sign. Human-readable on purpose —
 * a signer should be able to read what they are agreeing to in the wallet
 * popup.
 */
export function externalChallengeMessage(
  address: string,
  chain: ExternalChain,
  nonce: string,
  issuedAt: number,
): string {
  return [
    "defi1 cross-chain history import",
    "",
    `I control ${address} on ${chain}.`,
    "This signature links its public history to my private credit score.",
    "It grants no spending authority.",
    "",
    `nonce: ${nonce}`,
    `issued: ${issuedAt}`,
  ].join("\n");
}

export function externalOwnershipChallenge(address: string, chain: ExternalChain): ExternalChallenge {
  if (!isEvmAddress(address)) throw new OwnershipError(`not a valid EVM address: ${address}`);
  const nonce = randomNonce();
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    address,
    chain,
    nonce,
    issuedAt,
    message: externalChallengeMessage(address, chain, nonce, issuedAt),
  };
}

export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** EIP-191 `personal_sign` digest: keccak256("\x19Ethereum Signed Message:\n" + len + msg). */
export function personalSignDigest(message: string): Uint8Array {
  const body = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${body.length}`);
  const joined = new Uint8Array(prefix.length + body.length);
  joined.set(prefix, 0);
  joined.set(body, prefix.length);
  return keccak_256(joined);
}

/** The last 20 bytes of keccak256 of the uncompressed public key, minus its 0x04 tag. */
function addressFromPublicKey(pubKey: Uint8Array): string {
  const hash = keccak_256(pubKey.slice(1));
  return `0x${bytesToHex(hash.slice(-20))}`;
}

/**
 * Recover the address that produced an EIP-191 signature over `message`.
 * Accepts the 65-byte r‖s‖v encoding wallets return, with `v` as 27/28 or 0/1.
 */
export function recoverSigner(message: string, signature: string): string {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) {
    throw new OwnershipError(`signature must be 65 bytes (130 hex chars), got ${raw.length / 2}`);
  }
  let bytes: Uint8Array;
  try {
    bytes = hexToBytes(raw);
  } catch {
    throw new OwnershipError("signature is not valid hex");
  }

  const v = bytes[64];
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) {
    throw new OwnershipError(`unsupported recovery id ${v}`);
  }

  const digest = personalSignDigest(message);
  try {
    const sig = secp256k1.Signature.fromBytes(bytes.slice(0, 64), "compact").addRecoveryBit(recovery);
    return addressFromPublicKey(sig.recoverPublicKey(digest).toBytes(false));
  } catch (err) {
    throw new OwnershipError(`could not recover a signer: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export type OwnershipProof = {
  challenge: ExternalChallenge;
  /** 65-byte hex signature from the external wallet. */
  signature: string;
};

/**
 * Verify that `proof` really was produced by the external wallet it claims,
 * over the challenge we issued, recently. Throws `OwnershipError` otherwise.
 */
export function verifyExternalOwnership(proof: OwnershipProof, now = Math.floor(Date.now() / 1000)): void {
  const { challenge, signature } = proof;

  // The message must be exactly the one derived from the challenge fields —
  // otherwise a signature over attacker-chosen text would pass.
  const expected = externalChallengeMessage(
    challenge.address,
    challenge.chain,
    challenge.nonce,
    challenge.issuedAt,
  );
  if (challenge.message !== expected) {
    throw new OwnershipError("challenge message does not match its own fields");
  }
  if (now - challenge.issuedAt > CHALLENGE_TTL_SECONDS) {
    throw new OwnershipError("challenge expired — request a fresh one");
  }
  if (challenge.issuedAt - now > 60) {
    throw new OwnershipError("challenge is dated in the future");
  }

  const recovered = recoverSigner(challenge.message, signature);
  if (recovered.toLowerCase() !== challenge.address.toLowerCase()) {
    throw new OwnershipError(
      `signature is from ${recovered}, not the claimed address ${challenge.address}`,
    );
  }
}

// ---------------------------------------------------------------------------
// History -> score
// ---------------------------------------------------------------------------

const MONTH_SECONDS = 30 * 24 * 3600;

/**
 * Turn a history document into a bounded score contribution.
 *
 * Deliberately coarse and monotone: age and repayment help, liquidations hurt,
 * and nothing here can exceed `MAX_CROSS_CHAIN_SCORE`. Coarse buckets also mean
 * the derived number leaks little about the underlying wallet even to the
 * oracle that mints it.
 */
export function deriveCrossChainScore(
  history: ExternalHistory,
  now = Math.floor(Date.now() / 1000),
): bigint {
  const ageMonths = Math.max(0, Math.floor((now - history.firstActivityUnix) / MONTH_SECONDS));

  // Wallet age: up to 120 points, one per month, capped at 10 years.
  const agePoints = Math.min(120, ageMonths);
  // Sustained use: up to 60 points for months with real activity.
  const activityPoints = Math.min(60, Math.max(0, history.activeMonths) * 2);
  // Volume of use, heavily damped: up to 60 points.
  const txPoints = Math.min(60, Math.floor(Math.max(0, history.txCount) / 25));
  // Borrowing track record: 20 points a repayment, 40 off a liquidation.
  const repayPoints = Math.max(0, history.loansRepaid) * 20;
  const liquidationPenalty = Math.max(0, history.loansLiquidated) * 40;

  const raw = agePoints + activityPoints + txPoints + repayPoints - liquidationPenalty;
  const clamped = Math.max(0, Math.min(Number(MAX_CROSS_CHAIN_SCORE), raw));
  return BigInt(clamped);
}

/** Per-component breakdown, so the UI can show what earned what. */
export function crossChainBreakdown(
  history: ExternalHistory,
  now = Math.floor(Date.now() / 1000),
): Array<{ label: string; points: number }> {
  const ageMonths = Math.max(0, Math.floor((now - history.firstActivityUnix) / MONTH_SECONDS));
  return [
    { label: `Wallet age (${ageMonths} months)`, points: Math.min(120, ageMonths) },
    { label: `Active months (${history.activeMonths})`, points: Math.min(60, Math.max(0, history.activeMonths) * 2) },
    { label: `Transactions (${history.txCount})`, points: Math.min(60, Math.floor(Math.max(0, history.txCount) / 25)) },
    { label: `Loans repaid (${history.loansRepaid})`, points: Math.max(0, history.loansRepaid) * 20 },
    { label: `Liquidations (${history.loansLiquidated})`, points: -Math.max(0, history.loansLiquidated) * 40 },
  ];
}

// ---------------------------------------------------------------------------
// Commitment
// ---------------------------------------------------------------------------

/**
 * Bind (chain, address, history, nonce) into one 32-byte commitment. Stored in
 * the borrower's private state as proof of what was imported and when, without
 * keeping a second copy of the raw document anywhere it could leak.
 *
 * Canonical JSON — fixed key order — so the same history always hashes the same.
 */
export function historyCommitment(history: ExternalHistory, nonce: string): Uint8Array {
  const canonical = JSON.stringify([
    "defi1:cross-chain:v1",
    history.chain,
    history.address.toLowerCase(),
    history.firstActivityUnix,
    history.txCount,
    history.activeMonths,
    history.loansRepaid,
    history.loansLiquidated,
    nonce,
  ]);
  return sha256(new TextEncoder().encode(canonical));
}

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

/** What a successful import yields. */
export type LinkedWallet = {
  chain: ExternalChain;
  address: string;
  /** hex, 32 bytes. */
  commitment: string;
  /** The bounded contribution the oracle should attest. */
  derivedScore: bigint;
  linkedAt: number;
};

/**
 * Verify an ownership proof and ingest the history it covers.
 *
 * Throws `OwnershipError` if the signature does not hold, or if the history
 * document is for a different address than the one that was proven — the two
 * are checked against each other, not trusted independently.
 */
export function importCrossChainHistory(
  proof: OwnershipProof,
  history: ExternalHistory,
  now = Math.floor(Date.now() / 1000),
): LinkedWallet {
  verifyExternalOwnership(proof, now);

  if (history.address.toLowerCase() !== proof.challenge.address.toLowerCase()) {
    throw new OwnershipError(
      `history is for ${history.address} but ownership was proven for ${proof.challenge.address}`,
    );
  }
  if (history.chain !== proof.challenge.chain) {
    throw new OwnershipError(
      `history is for ${history.chain} but ownership was proven on ${proof.challenge.chain}`,
    );
  }
  if (history.firstActivityUnix > now) {
    throw new OwnershipError("history claims activity in the future");
  }

  return {
    chain: history.chain,
    address: history.address,
    commitment: bytesToHex(historyCommitment(history, proof.challenge.nonce)),
    derivedScore: deriveCrossChainScore(history, now),
    linkedAt: now,
  };
}

/** Parse an untrusted history JSON blob into a typed document. */
export function parseHistoryDocument(json: string): ExternalHistory {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new OwnershipError("history document is not valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new OwnershipError("history document must be a JSON object");
  }
  const o = raw as Record<string, unknown>;

  const chain = o.chain;
  if (typeof chain !== "string" || !EXTERNAL_CHAINS.includes(chain as ExternalChain)) {
    throw new OwnershipError(`unsupported chain: ${String(chain)}`);
  }
  if (typeof o.address !== "string" || !isEvmAddress(o.address)) {
    throw new OwnershipError(`not a valid EVM address: ${String(o.address)}`);
  }

  const num = (key: string): number => {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      throw new OwnershipError(`"${key}" must be a non-negative number`);
    }
    return Math.floor(v);
  };

  return {
    chain: chain as ExternalChain,
    address: o.address,
    firstActivityUnix: num("firstActivityUnix"),
    txCount: num("txCount"),
    activeMonths: num("activeMonths"),
    loansRepaid: num("loansRepaid"),
    loansLiquidated: num("loansLiquidated"),
  };
}
