// Nocturne — high-level lending client.
//
// Ties together: the connected wallet, the encrypted borrower private state,
// the compiled contract's circuit logic, and the prove→pay→submit pipeline.
//
// The `TxAssembler` is injected rather than constructed here so this module
// stays free of the ledger WASM: `MidnightTxAssembler` (in `tx-assembler.ts`)
// is the real one, and tests supply a fake. Build one with
// `MidnightTxAssembler.create({ api, config })`.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import type { ProofProgress } from "./proof-server";
import { submitContractCall, type AssembledCall, type SubmitResult } from "./submit";
import { queryContractState } from "./providers";
import {
  LendingStateManager,
  type Attestation,
  type AttestationField,
  type BorrowerPrivateState,
} from "./lending";

/** The circuits a client calls. Mirrors `CIRCUIT_IDS` in the contracts package. */
export type CircuitName =
  | "borrow"
  | "repay"
  | "depositLiquidity"
  | "withdrawLiquidity"
  | "issueAttestation"
  | "liquidate";

/** What a deploy yields once assembled. */
export type AssembledDeployment = AssembledCall & {
  contractAddress: string;
  signingKey: string;
};

/**
 * Builds unproven contract transactions. Structural, so `lending-client` does
 * not import the ledger types; `MidnightTxAssembler` satisfies it.
 */
export interface TxAssembler {
  call(
    contractAddress: string,
    circuitId: CircuitName,
    args: readonly unknown[],
    privateState: BorrowerPrivateState,
  ): Promise<AssembledCall>;

  deploy(
    issuerSecret: Uint8Array,
    privateState: BorrowerPrivateState,
  ): Promise<AssembledDeployment>;
}

export type BorrowParams = {
  useTier1: boolean;
  amount: bigint;
  collateral: bigint;
  dueTime: bigint;
};

export class LendingClient {
  private constructor(
    private readonly api: ConnectedAPI,
    private readonly config: ServiceConfig,
    private readonly state: LendingStateManager,
    private readonly assembler: TxAssembler,
    public contractAddress: string | null,
  ) {}

  static async create(opts: {
    api: ConnectedAPI;
    address: string;
    config: ServiceConfig;
    assembler: TxAssembler;
    contractAddress?: string;
  }): Promise<LendingClient> {
    const state = await LendingStateManager.forWallet(opts.api, opts.address);
    return new LendingClient(
      opts.api,
      opts.config,
      state,
      opts.assembler,
      opts.contractAddress ?? null,
    );
  }

  // --- private state ------------------------------------------------

  loadPrivateState(): Promise<BorrowerPrivateState | null> {
    return this.state.load();
  }

  importAttestation(field: AttestationField, att: Attestation): Promise<BorrowerPrivateState> {
    return this.state.importAttestation(field, att);
  }

  // --- lifecycle ---------------------------------------------------

  /**
   * Deploy a fresh pool. `issuerSecret` becomes the attestation issuer's key —
   * the deployer is the issuer. Returns the new contract address and the
   * maintenance signing key, which the caller must keep if the deployment is to
   * remain upgradable.
   */
  async deploy(
    issuerSecret: Uint8Array,
    onProgress: (p: ProofProgress) => void = () => {},
  ): Promise<{ contractAddress: string; signingKey: string }> {
    const ps = (await this.state.load()) ?? (await this.state.update((p) => p));
    const assembled = await this.assembler.deploy(issuerSecret, ps);
    await submitContractCall(this.api, this.config, async () => assembled, onProgress);
    this.contractAddress = assembled.contractAddress;
    return { contractAddress: assembled.contractAddress, signingKey: assembled.signingKey };
  }

  join(contractAddress: string): void {
    this.contractAddress = contractAddress;
  }

  // --- circuits --------------------------------------------------

  private async run(
    circuit: CircuitName,
    args: readonly unknown[],
    onProgress: (p: ProofProgress) => void,
  ): Promise<SubmitResult> {
    if (!this.contractAddress) throw new Error("no contract — deploy() or join() first");
    const ps = (await this.state.load()) ?? (await this.state.update((p) => p));
    return submitContractCall(
      this.api,
      this.config,
      () => this.assembler.call(this.contractAddress!, circuit, args, ps),
      onProgress,
    );
  }

  borrow(p: BorrowParams, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("borrow", [p.useTier1, p.amount, p.collateral, p.dueTime], onProgress);
  }

  repay(amount: bigint, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("repay", [amount], onProgress);
  }

  depositLiquidity(amount: bigint, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("depositLiquidity", [amount], onProgress);
  }

  withdrawLiquidity(amount: bigint, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("withdrawLiquidity", [amount], onProgress);
  }

  /** Issuer-only: publish an attestation leaf. */
  issueAttestation(leaf: Uint8Array, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("issueAttestation", [leaf], onProgress);
  }

  /** Anyone: close an overdue loan, revealing only its nullifier. */
  liquidate(nullifier: Uint8Array, onProgress: (x: ProofProgress) => void = () => {}): Promise<SubmitResult> {
    return this.run("liquidate", [nullifier], onProgress);
  }

  // --- reads ----------------------------------------------------

  async poolState(): Promise<{ data: string; blockHeight: number } | null> {
    if (!this.contractAddress) return null;
    return queryContractState(this.config, this.contractAddress);
  }
}
