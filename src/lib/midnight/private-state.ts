// Nocturne — encrypted-at-rest private state store, keyed to the connected wallet.
//
// The borrower's attestations, identity secret and cross-chain score never
// leave the device. This store keeps them in `localStorage` (or any injected
// backend) as AES-GCM ciphertext. The key is derived from a wallet signature
// (see `deriveStoreKey`), so a different wallet — or a wallet that refuses to
// sign — cannot read another identity's state.
//
// Shape mirrors midnight-js's `PrivateStateProvider` closely enough to adapt.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { decode, encode } from "./codec";

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** All keys currently held (used by `keys()` / `clear()`). */
  allKeys(): string[];
}

/** Default backend: browser `localStorage`. Falls back to an in-memory map. */
export function defaultStorage(): StorageBackend {
  const ls = typeof globalThis !== "undefined" ? (globalThis as { localStorage?: Storage }).localStorage : undefined;
  if (ls) {
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      allKeys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)!).filter(Boolean),
    };
  }
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
    allKeys: () => Array.from(mem.keys()),
  };
}

const DOMAIN = "nocturne:private-state:v1";

/**
 * Derive a stable AES-GCM key for this wallet by asking it to sign a fixed
 * domain string. The signature is deterministic per unshielded key, so the
 * same wallet always re-derives the same store key; a different wallet cannot.
 */
export async function deriveStoreKey(api: ConnectedAPI): Promise<CryptoKey> {
  const sig = await api.signData(DOMAIN, { encoding: "text", keyType: "unshielded" });
  const material = new TextEncoder().encode(`${sig.verifyingKey}:${sig.signature}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Alternative for tests / headless: derive from raw bytes. */
export async function storeKeyFromBytes(bytes: Uint8Array): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export class EncryptedPrivateStateStore {
  private readonly storage: StorageBackend;
  private readonly prefix: string;

  constructor(
    private readonly key: CryptoKey,
    opts: { address: string; storage?: StorageBackend; namespace?: string },
  ) {
    this.storage = opts.storage ?? defaultStorage();
    this.prefix = `${opts.namespace ?? DOMAIN}:${opts.address}:`;
  }

  private k(id: string): string {
    return this.prefix + id;
  }

  async set(id: string, state: unknown): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(encode(state));
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, plaintext),
    );
    const packed = new Uint8Array(iv.length + ct.length);
    packed.set(iv, 0);
    packed.set(ct, iv.length);
    this.storage.setItem(this.k(id), toB64(packed));
  }

  async get<T>(id: string): Promise<T | null> {
    const raw = this.storage.getItem(this.k(id));
    if (raw === null) return null;
    const packed = fromB64(raw);
    const iv = packed.slice(0, 12);
    const ct = packed.slice(12);
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, ct);
    } catch {
      throw new Error(
        "private state could not be decrypted — wrong wallet key, or the store was tampered with",
      );
    }
    return decode<T>(new TextDecoder().decode(plaintext));
  }

  async remove(id: string): Promise<void> {
    this.storage.removeItem(this.k(id));
  }

  async keys(): Promise<string[]> {
    return this.storage
      .allKeys()
      .filter((k) => k.startsWith(this.prefix))
      .map((k) => k.slice(this.prefix.length));
  }

  async clear(): Promise<void> {
    for (const id of await this.keys()) await this.remove(id);
  }
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}
function fromB64(b64: string): Uint8Array {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
