// Nocturne — the live path's pre-flight.
//
// Only the readiness check is unit-testable without a wallet; `connectLending`
// itself is covered by `tx-assembler.test.ts`, which assembles real
// transactions against the compiled contract.

import { describe, expect, it, vi } from "vitest";
import { checkLiveReadiness } from "./live";
import { defaultConfig } from "./config";

const config = defaultConfig("preprod");

function fakeApi(networkId = "preprod") {
  return {
    getConfiguration: vi.fn(async () => ({
      indexerUri: "https://indexer/graphql",
      indexerWsUri: "wss://indexer/ws",
      substrateNodeUri: "wss://rpc",
      networkId,
    })),
  } as never;
}

const served = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }));
const missing = vi.fn(async () => new Response(null, { status: 404 }));

describe("checkLiveReadiness", () => {
  it("passes when the artifacts are served and the networks agree", async () => {
    const result = await checkLiveReadiness(fakeApi(), config, served as unknown as typeof fetch);
    expect(result).toEqual({ ready: true, problems: [] });
  });

  it("names the fix when the ZK artifacts are not served", async () => {
    const result = await checkLiveReadiness(fakeApi(), config, missing as unknown as typeof fetch);
    expect(result.ready).toBe(false);
    expect(result.problems[0]).toMatch(/sync:zk/);
    expect(result.problems[0]).toContain(config.zkAssetBasePath);
  });

  it("catches a wallet on the wrong network", async () => {
    const result = await checkLiveReadiness(
      fakeApi("mainnet"),
      config,
      served as unknown as typeof fetch,
    );
    expect(result.ready).toBe(false);
    expect(result.problems.join(" ")).toMatch(/wallet is on "mainnet".*targets "preprod"/);
  });

  it("reports both problems at once rather than stopping at the first", async () => {
    const result = await checkLiveReadiness(
      fakeApi("mainnet"),
      config,
      missing as unknown as typeof fetch,
    );
    expect(result.problems).toHaveLength(2);
  });

  it("survives a fetch that throws", async () => {
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    const result = await checkLiveReadiness(fakeApi(), config, boom as unknown as typeof fetch);
    expect(result.ready).toBe(false);
    expect(result.problems[0]).toMatch(/offline/);
  });

  it("survives a wallet that refuses to report its configuration", async () => {
    const api = {
      getConfiguration: vi.fn(async () => {
        throw new Error("not granted");
      }),
    } as never;
    const result = await checkLiveReadiness(api, config, served as unknown as typeof fetch);
    expect(result.ready).toBe(false);
    expect(result.problems.join(" ")).toMatch(/not granted/);
  });
});
