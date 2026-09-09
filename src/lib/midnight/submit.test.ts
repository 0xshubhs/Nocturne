import { describe, expect, it, vi } from "vitest";
import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { defaultConfig } from "./config";
import { readFeeState, assertCanPayFees, ESTIMATED_CALL_FEE } from "./fees";
import { signMessage, ownershipChallenge } from "./signing";
import { submitContractCall, type UnprovenCall } from "./submit";
import { LendingClient, type TxAssembler } from "./lending-client";
import { storeKeyFromBytes } from "./private-state";
import { LendingStateManager } from "./lending";

function fakeApi(over: Partial<Record<keyof ConnectedAPI, unknown>> = {}): ConnectedAPI {
  const base = {
    getDustBalance: vi.fn(async () => ({ balance: 5_000_000n, cap: 10_000_000n })),
    signData: vi.fn(async (data: string) => ({ data, signature: `sig(${data})`, verifyingKey: "vk" })),
    getProvingProvider: vi.fn(async () => ({
      prove: vi.fn(async (bytes: Uint8Array) => new TextEncoder().encode(`proven:${new TextDecoder().decode(bytes)}`)),
      check: vi.fn(async () => []),
    })),
    balanceUnsealedTransaction: vi.fn(async (tx: string) => ({ tx: `balanced:${tx}` })),
    submitTransaction: vi.fn(async () => undefined),
  };
  return { ...base, ...over } as unknown as ConnectedAPI;
}

const config = defaultConfig("preprod");

describe("fees", () => {
  it("reads balance / cap / headroom", async () => {
    const api = fakeApi();
    const s = await readFeeState(api);
    expect(s.balance).toBe(5_000_000n);
    expect(s.headroom).toBeCloseTo(0.5);
    expect(s.sufficient).toBe(true);
  });

  it("assertCanPayFees throws below the estimate", () => {
    expect(() =>
      assertCanPayFees({ balance: ESTIMATED_CALL_FEE - 1n, cap: 1n, headroom: 0, sufficient: false }),
    ).toThrow(/not enough DUST/);
  });
});

describe("signing", () => {
  it("signs a UTF-8 message", async () => {
    const api = fakeApi();
    const s = await signMessage(api, "hello");
    expect(s).toEqual({ message: "hello", signature: "sig(hello)", verifyingKey: "vk" });
  });

  it("ownershipChallenge embeds the external address + a nonce", () => {
    const c = ownershipChallenge("0xabc");
    expect(c.message).toContain("0xabc");
    expect(c.message).toContain(c.nonce);
    expect(c.nonce).toHaveLength(32);
  });
});

describe("submitContractCall", () => {
  const call: UnprovenCall = { unprovenTx: "TX", circuitId: "borrow", contractAddress: "0xcontract" };

  it("runs prove → balance → submit → confirm in order", async () => {
    const api = fakeApi();
    const phases: string[] = [];
    const assemble = vi.fn(async () => call);

    // stub the indexer read used in the confirm phase
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { contractAction: { state: "0xdead", transaction: { block: { height: 42 } } } } })),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const res = await submitContractCall(api, config, assemble, (p) => phases.push(p.phase));

    expect(phases).toEqual(["building", "proving", "balancing", "submitting", "confirming", "done"]);
    expect(assemble).toHaveBeenCalledOnce();
    expect(api.getProvingProvider).toHaveBeenCalledOnce();
    expect(api.balanceUnsealedTransaction).toHaveBeenCalledWith("proven:TX", { payFees: true });
    expect(api.submitTransaction).toHaveBeenCalledWith("balanced:proven:TX");
    expect(res).toEqual({ txSubmitted: true, blockHeight: 42 });

    vi.unstubAllGlobals();
  });

  it("aborts before proving when DUST is too low", async () => {
    const api = fakeApi({ getDustBalance: vi.fn(async () => ({ balance: 1n, cap: 10n })) });
    const assemble = vi.fn(async () => call);
    await expect(submitContractCall(api, config, assemble, () => {})).rejects.toThrow(/not enough DUST/);
    expect(assemble).not.toHaveBeenCalled();
    expect(api.getProvingProvider).not.toHaveBeenCalled();
  });
});

describe("LendingClient orchestration", () => {
  it("threads private state + assembler + submit for borrow", async () => {
    const api = fakeApi();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: { contractAction: { state: "0x", transaction: { block: { height: 7 } } } } })),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const seen: Array<{ circuit: string; args: unknown[] }> = [];
    const assembler: TxAssembler = {
      deploy: vi.fn(async () => ({ contractAddress: "0xnew", unproven: { unprovenTx: "d", circuitId: "constructor", contractAddress: "0xnew" } })),
      call: vi.fn(async (_addr, circuit, args) => {
        seen.push({ circuit, args });
        return { unprovenTx: "c", circuitId: circuit, contractAddress: "0xnew" };
      }),
    };

    // deriveStoreKey calls api.signData under the hood
    const client = await LendingClient.create({
      api,
      address: "mn_addr_test",
      config,
      assembler,
      contractAddress: "0xnew",
    });

    const res = await client.borrow({ useTier1: true, amount: 1000n, collateral: 1000n, dueTime: 5n });
    expect(seen).toEqual([{ circuit: "borrow", args: [true, 1000n, 1000n, 5n] }]);
    expect(res.txSubmitted).toBe(true);

    vi.unstubAllGlobals();
  });

  it("refuses circuit calls with no contract address", async () => {
    const api = fakeApi();
    const assembler = { deploy: vi.fn(), call: vi.fn() } as unknown as TxAssembler;
    const client = await LendingClient.create({ api, address: "a", config, assembler });
    await expect(client.repay(1n)).rejects.toThrow(/no contract/);
  });
});

describe("LendingStateManager <-> client", () => {
  it("client attestation imports land in the encrypted store", async () => {
    const api = fakeApi();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(1));
    // use the manager directly to assert persistence semantics
    const mgr = LendingStateManager.withKey(key, "addr");
    await mgr.importAttestation("bank", { value: 200n, expiry: 9n });
    expect((await mgr.load())?.bank?.value).toBe(200n);
    expect(api).toBeDefined();
  });
});
