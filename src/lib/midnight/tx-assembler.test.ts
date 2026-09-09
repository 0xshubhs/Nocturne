// defi1 — transaction assembly, against the real compiled contract.
//
// No network and no proof server, but nothing about the assembly is faked: the
// contract state comes from a real deploy assembly (so its operations carry the
// real verifier keys), the circuit runs for real, and the transcript is
// partitioned and packed into a real unproven ledger transaction. What is
// stubbed is only the boundary — the indexer read, the wallet's keys, and the
// prover.
//
// Skipped when `contracts/src/managed` is absent; assembly needs the compiler's
// output, and a machine without it should say so rather than fail obscurely.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./config";
import type { BorrowerPrivateState } from "./lending";

const MANAGED = join(process.cwd(), "contracts/src/managed/lending");
const COMPILED = existsSync(join(MANAGED, "contract/index.js"));
const KEYED = existsSync(join(MANAGED, "keys/borrow.verifier"));

const config = { ...defaultConfig("undeployed"), zkAssetBasePath: "/zk/lending" };

/** Serves the compiler's real output, and the indexer, over the fetch seam. */
function diskFetch(contractStateHex?: string) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    // The indexer's GraphQL endpoint.
    if (init?.method === "POST") {
      const body = contractStateHex
        ? { data: { contractAction: { state: contractStateHex, transaction: { block: { height: 11 } } } } }
        : { data: { contractAction: null } };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    // ZK artifacts, straight off disk.
    const match = /\/zk\/lending\/(keys|zkir)\/(.+)$/.exec(url);
    if (match) {
      const file = join(MANAGED, match[1], match[2]);
      if (!existsSync(file)) return new Response(null, { status: 404 });
      const bytes = readFileSync(file);
      return new Response(new Uint8Array(bytes), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

/**
 * Only what the assembler actually touches on the wallet.
 *
 * The prover is never driven in these tests: a real proof is the one thing that
 * cannot be faked here, and the ledger's WASM traps on both invalid proof bytes
 * and a rejected promise rather than surfacing either. What *is* testable is
 * everything up to the proof, plus the key-location wiring the prover depends
 * on — see the `FetchKeyMaterialProvider` cases below.
 */
function fakeWallet() {
  const prove = vi.fn(async () => new Uint8Array());
  return {
    api: {
      getShieldedAddresses: vi.fn(async () => ({
        shieldedAddress: "mn_shield-addr_test",
        // A syntactically valid hex coin public key / encryption key pair.
        shieldedCoinPublicKey: "00".repeat(32),
        shieldedEncryptionPublicKey: "01".repeat(32),
      })),
      getProvingProvider: vi.fn(async () => ({ prove, check: vi.fn(async () => []) })),
    },
    prove,
  };
}

const privateState: BorrowerPrivateState = {
  callerSecret: new Uint8Array(32).fill(7),
};

const ISSUER_SECRET = new Uint8Array(32).fill(7);
const suite = COMPILED && KEYED ? describe : describe.skip;

suite("MidnightTxAssembler", () => {
  /**
   * Deploy assembly, and the state it produces — the one a call needs, because
   * its operations carry the deployed verifier keys that each call's key
   * location hashes.
   */
  async function deployed() {
    const { MidnightTxAssembler } = await import("./tx-assembler");
    const { serializeHex } = await import("./tx-assembler");
    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch() as unknown as typeof fetch,
    });

    const deploy = await assembler.deploy(ISSUER_SECRET, privateState);
    return { assembler, deploy, wallet, serializeHex };
  }

  it("assembles a deployment carrying an address and a maintenance key", async () => {
    const { deploy } = await deployed();

    expect(deploy.contractAddress).toMatch(/^[0-9a-f]+$/i);
    expect(deploy.contractAddress.length).toBeGreaterThan(32);
    expect(deploy.signingKey).toBeTruthy();
    expect(deploy.circuitId).toBe("constructor");
  }, 120_000);

  it("a deployment needs no circuit proof, and serializes without one", async () => {
    const { deploy, wallet } = await deployed();
    const provider = await wallet.api.getProvingProvider();

    const serialized = await deploy.prove(provider as never);
    expect(serialized).toMatch(/^[0-9a-f]+$/);
    expect(serialized.length).toBeGreaterThan(64);
    // A deploy installs verifier keys; it invokes no circuit, so there is
    // nothing for the prover to do. (A borrow would reach it — see below.)
    expect(wallet.prove).not.toHaveBeenCalled();
  }, 120_000);

  it("assembles a real contract call against the deployed state", async () => {
    const { MidnightTxAssembler } = await import("./tx-assembler");
    const { deploy } = await deployed();

    // What the indexer would hand back for this contract.
    const { serializeContractStateHex } = await import("./tx-assembler");
    const stateHex = serializeContractStateHex(deploy.initialContractState);

    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch(stateHex) as unknown as typeof fetch,
    });

    const call = await assembler.call(
      deploy.contractAddress,
      "depositLiquidity",
      [1000n],
      privateState,
    );

    expect(call.circuitId).toBe("depositLiquidity");
    expect(call.contractAddress).toBe(deploy.contractAddress);

    // A real, well-formed unproven ledger transaction — the transcript has been
    // partitioned and packed into a contract call prototype.
    const unproven = call.serializeUnproven();
    expect(unproven).toMatch(/^[0-9a-f]+$/);
    expect(unproven.length).toBeGreaterThan(256);
  }, 120_000);

  it("says so when the contract is not deployed", async () => {
    const { MidnightTxAssembler, ContractNotDeployedError } = await import("./tx-assembler");
    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      // no contract state for any address
      fetchImpl: diskFetch() as unknown as typeof fetch,
    });

    await expect(
      assembler.call("00".repeat(32), "depositLiquidity", [1000n], privateState),
    ).rejects.toThrow(ContractNotDeployedError);
  }, 120_000);

  it("refuses a circuit the contract does not have", async () => {
    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");
    const { deploy } = await deployed();
    const wallet = fakeWallet();
    const assembler = await MidnightTxAssembler.create({
      api: wallet.api as never,
      config,
      fetchImpl: diskFetch(serializeContractStateHex(deploy.initialContractState)) as unknown as typeof fetch,
    });

    await expect(
      assembler.call(deploy.contractAddress, "notACircuit" as never, [], privateState),
    ).rejects.toThrow();
  }, 120_000);
});

// The wallet's prover is handed a *contract key location*, not a circuit name.
// Left unparsed it would be fetched verbatim and 404 — which would only show up
// against a live wallet, minutes into a proof. These pin it down here instead.
describe("FetchKeyMaterialProvider key locations", () => {
  const BASE = "/zk/lending";

  function recordingFetch() {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      urls.push(String(input));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    });
    return { urls, fetchImpl: fetchImpl as unknown as typeof fetch };
  }

  it("resolves a bare circuit id", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const { urls, fetchImpl } = recordingFetch();
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl);

    await p.getProverKey("borrow");
    await p.getVerifierKey("borrow");
    expect(urls).toEqual([`${BASE}/keys/borrow.prover`, `${BASE}/keys/borrow.verifier`]);
  });

  it("resolves an encoded contract key location to the same files", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const { encodeContractKeyLocation } = await import("@midnight-ntwrk/midnight-js-types");
    const { urls, fetchImpl } = recordingFetch();
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl);

    const location = encodeContractKeyLocation({
      contractAddress: "ab".repeat(32),
      circuitId: "borrow",
      verifierKeyHash: "cd".repeat(32), // a 32-byte SHA-256 digest
    });
    // Whatever the encoding is, it is not the bare circuit name.
    expect(location).not.toBe("borrow");

    await p.getProverKey(location);
    expect(urls).toEqual([`${BASE}/keys/borrow.prover`]);
  });

  it("prefers the binary zkir and falls back to the text one", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      urls.push(url);
      // Only the text form exists here.
      return url.endsWith(".bzkir")
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([9]), { status: 200 });
    });
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl as unknown as typeof fetch);

    await p.getZKIR("repay");
    expect(urls).toEqual([`${BASE}/zkir/repay.bzkir`, `${BASE}/zkir/repay.zkir`]);
  });

  it("reports a missing artifact with its URL", async () => {
    const { FetchKeyMaterialProvider } = await import("./providers");
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 }));
    const p = new FetchKeyMaterialProvider(BASE, fetchImpl as unknown as typeof fetch);
    await expect(p.getProverKey("borrow")).rejects.toThrow(/ZK asset not found.*borrow\.prover.*404/);
  });
});

describe("hex helpers", () => {
  it("round-trip every byte value", async () => {
    if (!COMPILED) return;
    const { serializeHex, parseHex } = await import("./tx-assembler");
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(parseHex(serializeHex(bytes))).toEqual(bytes);
    expect(serializeHex(new Uint8Array([0, 15, 16, 255]))).toBe("000f10ff");
  });

  it("tolerates a 0x prefix and rejects odd lengths", async () => {
    if (!COMPILED) return;
    const { parseHex } = await import("./tx-assembler");
    expect(parseHex("0xff00")).toEqual(new Uint8Array([255, 0]));
    expect(() => parseHex("abc")).toThrow(/odd length/);
  });
});
