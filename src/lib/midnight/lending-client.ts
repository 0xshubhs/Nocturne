// defi1 — high-level lending client.
//
// Ties together: the connected wallet, the encrypted borrower private state,
// the compiled contract's circuit logic, and the prove→pay→submit pipeline.
//
// `TxAssembler` is the injection point for transaction assembly — the one part
// that still needs `@midnight-ntwrk/midnight-js-contracts` (version-blocked on
// our Compact 0.34 / runtime 0.19 toolchain) or hand-rolled `ledger-v8`. The
// runtime already produces the `callProofDataTrace` it needs; see
// `contracts/src/managed/lending`. Everything else here is wired and tested.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import type { ProofProgress } from "./proof-server";
import { submitContractCall, type SubmitResult, type UnprovenCall } from "./submit";
import { queryContractState } from "./providers";
import {
  LendingStateManager,
  type Attestation,
  type AttestationField,
  type BorrowerPrivateState,
} from "./lending";

export type CircuitName = "borrow" | "repay" | "depositLiquidity" | "withdrawLiquidity";

/**
 * Builds an unproven contract-call transaction for one circuit invocation.
 * Implemented against midnight-js-contracts or ledger-v8 once available.
 */
export interface TxAssembler {
  deploy(initialPrivateState: BorrowerPrivateState): Promise<{ contractAddress: string; unproven: UnprovenCall }>;
  call(
    contractAddress: string,
    circuit: CircuitName,
    args: unknown[],
    privateState: BorrowerPrivateState,
  ): Promise<UnprovenCall>;
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

  async deploy(): Promise<string> {
    const ps = (await this.state.load()) ?? (await this.state.update((p) => p));
    const { contractAddress, unproven } = await this.assembler.deploy(ps);
    await submitContractCall(this.api, this.config, async () => unproven, () => {});
    this.contractAddress = contractAddress;
    return contractAddress;
  }

  join(contractAddress: string): void {
    this.contractAddress = contractAddress;
  }

  // --- circuits --------------------------------------------------

  private async run(
    circuit: CircuitName,
    args: unknown[],
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

  // --- reads ----------------------------------------------------

  async poolState(): Promise<{ data: string; blockHeight: number } | null> {
    if (!this.contractAddress) return null;
    return queryContractState(this.config, this.contractAddress);
  }
}
