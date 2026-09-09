// Nocturne — the cross-chain linking flow end to end (plan.md §4).
//
// Runs the built-in demo signer, so the signature is a real EIP-191 signature
// over a real challenge, recovered with real secp256k1. The only thing these
// cases stub is who holds the key.

import { describe, expect, it, vi } from "vitest";
import { runLinkFlow, type ChallengeSigner } from "./link-flow";
import { DEMO_EVM_ADDRESS, demoPersonalSign } from "./evm-signer";
import { historyFor, PERSONAS } from "./personas";
import {
  deriveCrossChainScore,
  MAX_CROSS_CHAIN_SCORE,
  OwnershipError,
  type ExternalHistory,
} from "@/lib/midnight/cross-chain";

const NOW = 1_700_000_000;
const EXPIRY = BigInt(NOW + 365 * 24 * 3600);

const history = historyFor(PERSONAS.bob, BigInt(NOW))!;

/** The demo key signing whatever challenge it is handed. */
const demoSigner: ChallengeSigner = async (challenge) => ({
  address: challenge.address,
  signature: demoPersonalSign(challenge.message),
  source: "demo-key",
});

describe("runLinkFlow", () => {
  it("verifies, scores and hands back an attestation for the oracle to mint", async () => {
    const out = await runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: demoSigner });

    expect(out.source).toBe("demo-key");
    expect(out.linked.address.toLowerCase()).toBe(DEMO_EVM_ADDRESS.toLowerCase());
    expect(out.linked.chain).toBe("ethereum");
    expect(out.linked.derivedScore).toBe(deriveCrossChainScore(history, NOW));
    expect(out.attestation).toEqual({ value: out.linked.derivedScore, expiry: EXPIRY });
  });

  it("never yields more than the cap, whatever the history claims", async () => {
    const absurd: ExternalHistory = {
      ...history,
      firstActivityUnix: 0,
      txCount: 50_000_000,
      activeMonths: 5000,
      loansRepaid: 5000,
    };
    const out = await runLinkFlow({ history: absurd, now: NOW, expiry: EXPIRY, sign: demoSigner });
    expect(out.attestation.value).toBe(MAX_CROSS_CHAIN_SCORE);
  });

  it("binds the challenge to the address the signer actually used", async () => {
    // An injected wallet picks its own account; the challenge must follow it.
    const signer = vi.fn<ChallengeSigner>(async (_challenge, buildMessage) => ({
      address: DEMO_EVM_ADDRESS,
      signature: demoPersonalSign(buildMessage(DEMO_EVM_ADDRESS)),
      source: "injected",
    }));

    const out = await runLinkFlow({
      history: { ...history, address: "0x0000000000000000000000000000000000000001" },
      now: NOW,
      expiry: EXPIRY,
      sign: signer,
    });

    expect(signer).toHaveBeenCalledOnce();
    expect(out.source).toBe("injected");
    expect(out.linked.address).toBe(DEMO_EVM_ADDRESS);
  });

  it("rejects a signature from a key that does not control the address", async () => {
    const wrongSigner: ChallengeSigner = async (challenge) => ({
      // claims an address the demo key does not control
      address: "0x000000000000000000000000000000000000dEaD",
      signature: demoPersonalSign(challenge.message),
      source: "demo-key",
    });

    await expect(
      runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: wrongSigner }),
    ).rejects.toThrow(OwnershipError);
  });

  it("rejects a signature over something other than the challenge", async () => {
    const offMessageSigner: ChallengeSigner = async (challenge) => ({
      address: challenge.address,
      signature: demoPersonalSign("gm"),
      source: "demo-key",
    });

    await expect(
      runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: offMessageSigner }),
    ).rejects.toThrow(/not the claimed address/);
  });

  it("mints a fresh nonce each time, so a signature cannot be replayed", async () => {
    const seen: string[] = [];
    const recording: ChallengeSigner = async (challenge) => {
      seen.push(challenge.nonce);
      return { address: challenge.address, signature: demoPersonalSign(challenge.message), source: "demo-key" };
    };

    const a = await runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: recording });
    const b = await runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: recording });

    expect(seen[0]).not.toBe(seen[1]);
    // A different nonce means a different commitment for the same history.
    expect(a.linked.commitment).not.toBe(b.linked.commitment);
  });

  it("propagates a rejection from the wallet", async () => {
    const rejecting: ChallengeSigner = async () => {
      throw new Error("user rejected the request");
    };
    await expect(
      runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: rejecting }),
    ).rejects.toThrow(/user rejected/);
  });

  it("bob's linked wallet moves him up but not into tier 1", async () => {
    // The demo's point: cross-chain history is real credit, not a cheat code.
    const out = await runLinkFlow({ history, now: NOW, expiry: EXPIRY, sign: demoSigner });
    const bobBase = 500n; // 100*2 + 80*3 + 15*4
    expect(out.attestation.value).toBeGreaterThan(0n);
    expect(bobBase + out.attestation.value).toBeGreaterThanOrEqual(500n);
    expect(bobBase + out.attestation.value).toBeLessThan(750n);
  });
});
