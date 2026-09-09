import { describe, expect, it } from "vitest";
import { decode, encode } from "./codec";
import {
  EncryptedPrivateStateStore,
  storeKeyFromBytes,
  type StorageBackend,
} from "./private-state";
import { LendingStateManager, emptyBorrowerState } from "./lending";

function memStorage(): StorageBackend {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    allKeys: () => [...m.keys()],
  };
}

describe("codec", () => {
  it("round-trips bigint and Uint8Array", () => {
    const value = {
      secret: new Uint8Array([1, 2, 3, 250, 255]),
      score: 123456789012345678901234567890n,
      nested: { xs: [1n, 2n], flag: true, s: "hi" },
    };
    const back = decode<typeof value>(encode(value));
    expect(back.score).toBe(value.score);
    expect(back.secret).toBeInstanceOf(Uint8Array);
    expect([...back.secret]).toEqual([1, 2, 3, 250, 255]);
    expect(back.nested.xs).toEqual([1n, 2n]);
  });
});

describe("EncryptedPrivateStateStore", () => {
  it("encrypts, and round-trips through storage", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(1));
    const store = new EncryptedPrivateStateStore(key, { address: "mn_addr_test_alice", storage });

    const state = { callerSecret: new Uint8Array(32).fill(7), crossChainScore: 42n };
    await store.set("borrower", state);

    // stored value is not plaintext
    const raw = storage.allKeys().map((k) => storage.getItem(k)!);
    expect(raw.join()).not.toContain("crossChainScore");

    const back = await store.get<typeof state>("borrower");
    expect(back?.crossChainScore).toBe(42n);
    expect([...(back!.callerSecret)]).toEqual(Array(32).fill(7));
  });

  it("rejects a wrong key", async () => {
    const storage = memStorage();
    const good = await storeKeyFromBytes(new Uint8Array(32).fill(1));
    const bad = await storeKeyFromBytes(new Uint8Array(32).fill(2));
    await new EncryptedPrivateStateStore(good, { address: "a", storage }).set("x", { n: 1n });
    await expect(
      new EncryptedPrivateStateStore(bad, { address: "a", storage }).get("x"),
    ).rejects.toThrow(/could not be decrypted/);
  });

  it("scopes state per wallet address", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(9));
    const alice = new EncryptedPrivateStateStore(key, { address: "alice", storage });
    const bob = new EncryptedPrivateStateStore(key, { address: "bob", storage });
    await alice.set("borrower", { crossChainScore: 1n });
    expect(await bob.get("borrower")).toBeNull();
    expect(await alice.keys()).toEqual(["borrower"]);
  });

  it("clear() only removes this address's entries", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(3));
    const alice = new EncryptedPrivateStateStore(key, { address: "alice", storage });
    const bob = new EncryptedPrivateStateStore(key, { address: "bob", storage });
    await alice.set("a", { n: 1n });
    await bob.set("b", { n: 2n });
    await alice.clear();
    expect(await alice.keys()).toEqual([]);
    expect(await bob.get("b")).toEqual({ n: 2n });
  });
});

describe("LendingStateManager", () => {
  it("imports attestations and cross-chain score into encrypted state", async () => {
    const storage = memStorage();
    const key = await storeKeyFromBytes(new Uint8Array(32).fill(5));
    const mgr = LendingStateManager.withKey(key, "mn_addr_test", storage);

    await mgr.save(emptyBorrowerState(new Uint8Array(32).fill(11)));
    await mgr.importAttestation("bank", { value: 200n, expiry: 9_999_999n });
    await mgr.importAttestation("salary", { value: 150n, expiry: 9_999_999n });
    const final = await mgr.setCrossChainScore(40n);

    expect(final.bank?.value).toBe(200n);
    expect(final.salary?.value).toBe(150n);
    expect(final.crossChainScore).toBe(40n);

    const reloaded = await mgr.load();
    expect(reloaded?.bank?.value).toBe(200n);
    expect(reloaded?.callerSecret).toBeInstanceOf(Uint8Array);
  });
});
