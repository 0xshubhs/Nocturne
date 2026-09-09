import { describe, expect, it } from "vitest";
import { configFromWallet, defaultConfig, isNetworkId } from "./config";
import { PHASE_LABELS, runWithProgress, type ProofProgress } from "./proof-server";

describe("config", () => {
  it("has endpoints for every network", () => {
    for (const n of ["undeployed", "preview", "preprod", "mainnet"] as const) {
      const c = defaultConfig(n);
      expect(c.networkId).toBe(n);
      expect(c.indexerUri).toMatch(/graphql/);
      expect(c.proofServerUri).toMatch(/^https?:\/\//);
    }
  });

  it("prefers wallet-reported URIs, keeps our proof server", () => {
    const merged = configFromWallet({
      indexerUri: "https://custom/graphql",
      indexerWsUri: "wss://custom/ws",
      substrateNodeUri: "wss://custom/rpc",
      networkId: "preprod",
    });
    expect(merged.indexerUri).toBe("https://custom/graphql");
    expect(merged.proofServerUri).toBe(defaultConfig("preprod").proofServerUri);
  });

  it("falls back when the wallet reports an unknown network", () => {
    const merged = configFromWallet({
      indexerUri: "",
      indexerWsUri: "",
      substrateNodeUri: "",
      networkId: "weirdnet",
    });
    expect(isNetworkId(merged.networkId)).toBe(true);
  });
});

describe("runWithProgress", () => {
  it("reports each phase in order, then done", async () => {
    const seen: string[] = [];
    const onProgress = (p: ProofProgress) => seen.push(p.phase);
    await runWithProgress(
      [
        { phase: "building", run: async () => {} },
        { phase: "proving", run: async () => ({ txId: "0xabc" }) },
        { phase: "submitting", run: async () => {} },
      ],
      onProgress,
    );
    expect(seen).toEqual(["building", "proving", "submitting", "done"]);
    expect(PHASE_LABELS.proving).toMatch(/zero-knowledge/i);
  });

  it("surfaces an error phase and rethrows", async () => {
    const seen: ProofProgress[] = [];
    await expect(
      runWithProgress(
        [{ phase: "proving", run: async () => { throw new Error("prover down"); } }],
        (p) => seen.push(p),
      ),
    ).rejects.toThrow("prover down");
    expect(seen.at(-1)?.phase).toBe("error");
    expect(seen.at(-1)?.error).toBe("prover down");
  });
});
