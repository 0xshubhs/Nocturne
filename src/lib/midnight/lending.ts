// Nocturne — app-side view of the lending contract: the private-state shape the
// borrower holds locally, plus a typed wrapper over the encrypted store.
//
// The private-state shape MUST match `contracts/src/witnesses.ts`
// (`DefiPrivateState`). Kept as a local mirror because the contract package is
// a sibling workspace; the fields and semantics are identical.
//
// Linked external wallets live under their own key rather than inside the
// borrower state, so the mirror stays exact — the witnesses layer has no
// business knowing about them, and only the derived `crossChain` attestation
// ever reaches a circuit.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import { EncryptedPrivateStateStore, deriveStoreKey, type StorageBackend } from "./private-state";
import type { LinkedWallet } from "./cross-chain";
import type { Attestation, AttestationField } from "./score";

export const LENDING_PRIVATE_STATE_ID = "nocturne.borrower" as const;
export const LINKED_WALLETS_ID = "nocturne.linked-wallets" as const;

export type { Attestation, AttestationField };

/** Mirror of `DefiPrivateState` in contracts/src/witnesses.ts. */
export type BorrowerPrivateState = {
  callerSecret: Uint8Array; // 32-byte long-lived identity secret
  bank?: Attestation;
  salary?: Attestation;
  repay?: Attestation;
  /**
   * Minted by the issuer acting as the cross-chain oracle, after it checks an
   * external-wallet ownership proof. Every subject is onboarded with a
   * zero-valued leaf, so a borrower who has linked nothing still has a path to
   * prove. The borrower cannot mint this.
   */
  crossChain?: Attestation;
};

export function emptyBorrowerState(callerSecret: Uint8Array): BorrowerPrivateState {
  return { callerSecret };
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

  async importAttestation(field: AttestationField, att: Attestation): Promise<BorrowerPrivateState> {
    return this.update((prev) => ({ ...prev, [field]: att }));
  }

  // --- linked external wallets (plan.md §4) ---------------------------

  async linkedWallets(): Promise<LinkedWallet[]> {
    return (await this.store.get<LinkedWallet[]>(LINKED_WALLETS_ID)) ?? [];
  }

  /**
   * Record a verified external wallet. Re-linking the same address on the same
   * chain replaces the earlier record rather than accumulating duplicates.
   */
  async addLinkedWallet(wallet: LinkedWallet): Promise<LinkedWallet[]> {
    const existing = await this.linkedWallets();
    const rest = existing.filter(
      (w) => !(w.chain === wallet.chain && w.address.toLowerCase() === wallet.address.toLowerCase()),
    );
    const next = [...rest, wallet];
    await this.store.set(LINKED_WALLETS_ID, next);
    return next;
  }

  async removeLinkedWallet(chain: string, address: string): Promise<LinkedWallet[]> {
    const next = (await this.linkedWallets()).filter(
      (w) => !(w.chain === chain && w.address.toLowerCase() === address.toLowerCase()),
    );
    await this.store.set(LINKED_WALLETS_ID, next);
    return next;
  }

  async reset(): Promise<void> {
    await this.store.clear();
  }
}
