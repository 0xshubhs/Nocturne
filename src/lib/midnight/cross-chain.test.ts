// Nocturne — cross-chain history import (plan.md §4).
//
// The signatures here are produced with real secp256k1 keys and verified
// through the same EIP-191 path a MetaMask `personal_sign` takes, so a passing
// suite means an actual wallet signature would verify too.

import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  CHALLENGE_TTL_SECONDS,
  crossChainBreakdown,
  deriveCrossChainScore,
  externalChallengeMessage,
  historyCommitment,
  importCrossChainHistory,
  isEvmAddress,
  MAX_CROSS_CHAIN_SCORE,
  OwnershipError,
  externalOwnershipChallenge,
  parseHistoryDocument,
  personalSignDigest,
  recoverSigner,
  verifyExternalOwnership,
  type ExternalChallenge,
  type ExternalHistory,
} from "./cross-chain";

const NOW = 1_700_000_000;

/** A throwaway EVM keypair, and the EIP-191 signing a wallet would do. */
function evmWallet(seed: number) {
  const priv = new Uint8Array(32).fill(seed);
  const pub = secp256k1.getPublicKey(priv, false);
  const address = `0x${bytesToHex(keccak_256(pub.slice(1)).slice(-20))}`;

  function personalSign(message: string): string {
    const digest = personalSignDigest(message);
    const recovered = secp256k1.sign(digest, priv, { prehash: false, format: "recovered" });
    // noble emits v‖r‖s; wallets emit r‖s‖v with v offset by 27.
    const v = recovered[0];
    const rs = recovered.slice(1);
    return `0x${bytesToHex(rs)}${(v + 27).toString(16).padStart(2, "0")}`;
  }

  return { priv, address, personalSign };
}

const alice = evmWallet(3);
const mallory = evmWallet(9);

function challengeFor(address: string, issuedAt = NOW): ExternalChallenge {
  const nonce = "a".repeat(32);
  return {
    address,
    chain: "ethereum",
    nonce,
    issuedAt,
    message: externalChallengeMessage(address, "ethereum", nonce, issuedAt),
  };
}

const HISTORY: ExternalHistory = {
  chain: "ethereum",
  address: alice.address,
  firstActivityUnix: NOW - 3 * 365 * 24 * 3600, // ~3 years old
  txCount: 900,
  activeMonths: 20,
  loansRepaid: 2,
  loansLiquidated: 0,
};

describe("EVM address handling", () => {
  it("accepts well-formed addresses and rejects the rest", () => {
    expect(isEvmAddress(alice.address)).toBe(true);
    expect(isEvmAddress(alice.address.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(isEvmAddress("0x1234")).toBe(false);
    expect(isEvmAddress(alice.address.slice(2))).toBe(false);
    expect(isEvmAddress("")).toBe(false);
  });
});

describe("signature recovery", () => {
  it("recovers the signer of a personal_sign signature", () => {
    const message = "nocturne test message";
    const sig = alice.personalSign(message);
    expect(recoverSigner(message, sig).toLowerCase()).toBe(alice.address.toLowerCase());
  });

  it("recovers a different address for a different signer", () => {
    const message = "nocturne test message";
    expect(recoverSigner(message, mallory.personalSign(message)).toLowerCase()).toBe(
      mallory.address.toLowerCase(),
    );
  });

  it("recovers a different address when the message changes", () => {
    const sig = alice.personalSign("message one");
    expect(recoverSigner("message two", sig).toLowerCase()).not.toBe(alice.address.toLowerCase());
  });

  it("accepts a raw 0/1 recovery id as well as 27/28", () => {
    const message = "nocturne test message";
    const sig = alice.personalSign(message);
    const v = parseInt(sig.slice(-2), 16);
    const rawV = (v - 27).toString(16).padStart(2, "0");
    expect(recoverSigner(message, `${sig.slice(0, -2)}${rawV}`).toLowerCase()).toBe(
      alice.address.toLowerCase(),
    );
  });

  it("rejects malformed signatures", () => {
    expect(() => recoverSigner("m", "0xdeadbeef")).toThrow(OwnershipError);
    expect(() => recoverSigner("m", `0x${"zz".repeat(65)}`)).toThrow(OwnershipError);
    expect(() => recoverSigner("m", `0x${"00".repeat(64)}05`)).toThrow(/recovery id/);
  });
});

describe("ownership challenge", () => {
  it("mints a fresh nonce and a message derived from its own fields", () => {
    const c1 = externalOwnershipChallenge(alice.address, "base");
    const c2 = externalOwnershipChallenge(alice.address, "base");
    expect(c1.nonce).not.toBe(c2.nonce);
    expect(c1.message).toBe(
      externalChallengeMessage(alice.address, "base", c1.nonce, c1.issuedAt),
    );
    expect(c1.message).toContain(alice.address);
    expect(c1.message).toContain("grants no spending authority");
  });

  it("refuses a malformed address", () => {
    expect(() => externalOwnershipChallenge("not-an-address", "ethereum")).toThrow(OwnershipError);
  });

  it("verifies a genuine proof", () => {
    const challenge = challengeFor(alice.address);
    expect(() =>
      verifyExternalOwnership({ challenge, signature: alice.personalSign(challenge.message) }, NOW),
    ).not.toThrow();
  });

  it("rejects a signature from another wallet", () => {
    const challenge = challengeFor(alice.address);
    expect(() =>
      verifyExternalOwnership({ challenge, signature: mallory.personalSign(challenge.message) }, NOW),
    ).toThrow(/not the claimed address/);
  });

  it("rejects a message that does not match the challenge fields", () => {
    const challenge = { ...challengeFor(alice.address), message: "sign this instead" };
    expect(() =>
      verifyExternalOwnership({ challenge, signature: alice.personalSign("sign this instead") }, NOW),
    ).toThrow(/does not match its own fields/);
  });

  it("rejects a stale challenge", () => {
    const challenge = challengeFor(alice.address, NOW - CHALLENGE_TTL_SECONDS - 1);
    expect(() =>
      verifyExternalOwnership({ challenge, signature: alice.personalSign(challenge.message) }, NOW),
    ).toThrow(/expired/);
  });

  it("rejects a challenge dated in the future", () => {
    const challenge = challengeFor(alice.address, NOW + 3600);
    expect(() =>
      verifyExternalOwnership({ challenge, signature: alice.personalSign(challenge.message) }, NOW),
    ).toThrow(/dated in the future/);
  });

  it("a signature for one nonce does not verify against another", () => {
    const first = challengeFor(alice.address);
    const replayed: ExternalChallenge = {
      ...first,
      nonce: "b".repeat(32),
      message: externalChallengeMessage(alice.address, "ethereum", "b".repeat(32), first.issuedAt),
    };
    expect(() =>
      verifyExternalOwnership({ challenge: replayed, signature: alice.personalSign(first.message) }, NOW),
    ).toThrow(/not the claimed address/);
  });
});

describe("derived score", () => {
  it("is bounded by the cap the issuer enforces", () => {
    const maxed: ExternalHistory = {
      ...HISTORY,
      firstActivityUnix: 0,
      txCount: 10_000_000,
      activeMonths: 1000,
      loansRepaid: 1000,
    };
    expect(deriveCrossChainScore(maxed, NOW)).toBe(MAX_CROSS_CHAIN_SCORE);
  });

  it("never goes below zero", () => {
    const wrecked: ExternalHistory = {
      ...HISTORY,
      firstActivityUnix: NOW,
      txCount: 0,
      activeMonths: 0,
      loansRepaid: 0,
      loansLiquidated: 50,
    };
    expect(deriveCrossChainScore(wrecked, NOW)).toBe(0n);
  });

  it("rewards age, use and repayment", () => {
    const young = { ...HISTORY, firstActivityUnix: NOW - 30 * 24 * 3600 };
    expect(deriveCrossChainScore(HISTORY, NOW)).toBeGreaterThan(deriveCrossChainScore(young, NOW));

    const quiet = { ...HISTORY, txCount: 10, activeMonths: 1 };
    expect(deriveCrossChainScore(HISTORY, NOW)).toBeGreaterThan(deriveCrossChainScore(quiet, NOW));

    const noRepayments = { ...HISTORY, loansRepaid: 0 };
    expect(deriveCrossChainScore(HISTORY, NOW)).toBeGreaterThan(deriveCrossChainScore(noRepayments, NOW));
  });

  it("penalises liquidations", () => {
    const burned = { ...HISTORY, loansLiquidated: 1 };
    expect(deriveCrossChainScore(burned, NOW)).toBeLessThan(deriveCrossChainScore(HISTORY, NOW));
  });

  it("is deterministic", () => {
    expect(deriveCrossChainScore(HISTORY, NOW)).toBe(deriveCrossChainScore({ ...HISTORY }, NOW));
  });

  it("the breakdown sums to the score before clamping", () => {
    const rows = crossChainBreakdown(HISTORY, NOW);
    const total = rows.reduce((acc, r) => acc + r.points, 0);
    expect(BigInt(Math.max(0, Math.min(Number(MAX_CROSS_CHAIN_SCORE), total)))).toBe(
      deriveCrossChainScore(HISTORY, NOW),
    );
  });
});

describe("history commitment", () => {
  it("is 32 bytes and stable for the same input", () => {
    const c = historyCommitment(HISTORY, "nonce");
    expect(c).toHaveLength(32);
    expect(bytesToHex(c)).toBe(bytesToHex(historyCommitment({ ...HISTORY }, "nonce")));
  });

  it("changes when any bound field changes", () => {
    const base = bytesToHex(historyCommitment(HISTORY, "nonce"));
    expect(bytesToHex(historyCommitment({ ...HISTORY, txCount: 901 }, "nonce"))).not.toBe(base);
    expect(bytesToHex(historyCommitment({ ...HISTORY, chain: "base" }, "nonce"))).not.toBe(base);
    expect(bytesToHex(historyCommitment(HISTORY, "other"))).not.toBe(base);
  });

  it("is case-insensitive on the address", () => {
    const upper = { ...HISTORY, address: HISTORY.address.toUpperCase().replace("0X", "0x") };
    expect(bytesToHex(historyCommitment(upper, "n"))).toBe(bytesToHex(historyCommitment(HISTORY, "n")));
  });
});

describe("import", () => {
  it("verifies, scores and commits in one step", () => {
    const challenge = challengeFor(alice.address);
    const linked = importCrossChainHistory(
      { challenge, signature: alice.personalSign(challenge.message) },
      HISTORY,
      NOW,
    );
    expect(linked.address).toBe(alice.address);
    expect(linked.chain).toBe("ethereum");
    expect(linked.derivedScore).toBe(deriveCrossChainScore(HISTORY, NOW));
    expect(linked.derivedScore).toBeLessThanOrEqual(MAX_CROSS_CHAIN_SCORE);
    expect(linked.commitment).toHaveLength(64);
    expect(linked.linkedAt).toBe(NOW);
  });

  it("refuses a history for an address that was not the one proven", () => {
    const challenge = challengeFor(alice.address);
    expect(() =>
      importCrossChainHistory(
        { challenge, signature: alice.personalSign(challenge.message) },
        { ...HISTORY, address: mallory.address },
        NOW,
      ),
    ).toThrow(/ownership was proven for/);
  });

  it("refuses a history for a different chain than was proven", () => {
    const challenge = challengeFor(alice.address);
    expect(() =>
      importCrossChainHistory(
        { challenge, signature: alice.personalSign(challenge.message) },
        { ...HISTORY, chain: "base" },
        NOW,
      ),
    ).toThrow(/proven on ethereum/);
  });

  it("refuses history dated in the future", () => {
    const challenge = challengeFor(alice.address);
    expect(() =>
      importCrossChainHistory(
        { challenge, signature: alice.personalSign(challenge.message) },
        { ...HISTORY, firstActivityUnix: NOW + 1 },
        NOW,
      ),
    ).toThrow(/activity in the future/);
  });
});

describe("history document parsing", () => {
  const valid = JSON.stringify(HISTORY);

  it("round-trips a valid document", () => {
    expect(parseHistoryDocument(valid)).toEqual(HISTORY);
  });

  it("rejects junk", () => {
    expect(() => parseHistoryDocument("not json")).toThrow(/not valid JSON/);
    expect(() => parseHistoryDocument("[]")).toThrow(/must be a JSON object/);
    expect(() => parseHistoryDocument("null")).toThrow(/must be a JSON object/);
  });

  it("rejects an unsupported chain or bad address", () => {
    expect(() => parseHistoryDocument(JSON.stringify({ ...HISTORY, chain: "solana" }))).toThrow(
      /unsupported chain/,
    );
    expect(() => parseHistoryDocument(JSON.stringify({ ...HISTORY, address: "0x1" }))).toThrow(
      /valid EVM address/,
    );
  });

  it("rejects missing or negative numeric fields", () => {
    const withoutTxCount: Partial<ExternalHistory> = { ...HISTORY };
    delete withoutTxCount.txCount;
    expect(() => parseHistoryDocument(JSON.stringify(withoutTxCount))).toThrow(/"txCount"/);
    expect(() => parseHistoryDocument(JSON.stringify({ ...HISTORY, activeMonths: -1 }))).toThrow(
      /"activeMonths"/,
    );
  });
});
