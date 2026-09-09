// defi1 — app-side view of the lending contract: the private-state shape the
// borrower holds locally, plus a typed wrapper over the encrypted store.
//
// The private-state shape MUST match `contracts/src/witnesses.ts`
// (`DefiPrivateState`). Kept as a local mirror because the contract package is
// a sibling workspace; the fields and semantics are identical.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { EncryptedPrivateStateStore, deriveStoreKey, type StorageBackend } from "./private-state";

export const LENDING_PRIVATE_STATE_ID = "defi1.borrower" as const;

/** One attestation the borrower holds (bucketed value, never the raw figure). */
export type Attestation = {
  value: bigint;
  expiry: bigint; // unix seconds
};

/** Mirror of `DefiPrivateState` in contracts/src/witnesses.ts. */
export type BorrowerPrivateState = {
  callerSecret: Uint8Array; // 32-byte long-lived identity secret
  bank?: Attestation;
  salary?: Attestation;
  repay?: Attestation;
  crossChainScore: bigint;
};

export function emptyBorrowerState(callerSecret: Uint8Array): BorrowerPrivateState {
  return { callerSecret, crossChainScore: 0n };
}

/**
 * Typed access to the borrower's encrypted private state, scoped to one wallet
 * address. Construct via `LendingStateManager.forWallet(api, address)`.
 */
export class LendingStateManager {
  private constructor(private readonly store: EncryptedPrivateStateStore) {}

  static async forWallet(
    api: ConnectedAPI,
    address: string,
    storage?: StorageBackend,
  ): Promise<LendingStateManager> {
    const key = await deriveStoreKey(api);
    return new LendingStateManager(new EncryptedPrivateStateStore(key, { address, storage }));
  }

  /** For tests / headless flows. */
  static withKey(key: CryptoKey, address: string, storage?: StorageBackend): LendingStateManager {
    return new LendingStateManager(new EncryptedPrivateStateStore(key, { address, storage }));
  }

  async load(): Promise<BorrowerPrivateState | null> {
    return this.store.get<BorrowerPrivateState>(LENDING_PRIVATE_STATE_ID);
  }

  async save(state: BorrowerPrivateState): Promise<void> {
    await this.store.set(LENDING_PRIVATE_STATE_ID, state);
  }

  async update(fn: (prev: BorrowerPrivateState) => BorrowerPrivateState): Promise<BorrowerPrivateState> {
    const prev = (await this.load()) ?? emptyBorrowerState(crypto.getRandomValues(new Uint8Array(32)));
    const next = fn(prev);
    await this.save(next);
    return next;
  }

  async importAttestation(field: "bank" | "salary" | "repay", att: Attestation): Promise<BorrowerPrivateState> {
    return this.update((prev) => ({ ...prev, [field]: att }));
  }

  async setCrossChainScore(score: bigint): Promise<BorrowerPrivateState> {
    return this.update((prev) => ({ ...prev, crossChainScore: score }));
  }

  async reset(): Promise<void> {
    await this.store.clear();
  }
}
