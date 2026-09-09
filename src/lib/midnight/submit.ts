// defi1 — the "prove → pay fees → submit → confirm" pipeline.
//
// Composes the DApp Connector API's proving, balancing and relay methods with
// the `proof-server.ts` phase machine so every borrow / repay call renders the
// same progress UI.
//
// The wallet does the expensive and the sensitive parts: `getProvingProvider`
// returns a prover bound to our compiled circuit assets,
// `balanceUnsealedTransaction` pays DUST fees and fixes imbalances, and
// `submitTransaction` relays. We never hold a key.
//
// Assembly lives behind `TxAssembler` (implemented in `tx-assembler.ts`) so
// that this module — and everything that imports it — stays free of the ledger
// and onchain-runtime WASM.

import type { ConnectedAPI, ProvingProvider } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import { assertCanPayFees, readFeeState } from "./fees";
import { getProvingProvider, queryContractState } from "./providers";
import { runWithProgress, type ProofProgress } from "./proof-server";

export type SubmitResult = {
  txSubmitted: true;
  /** Latest ledger state after the call landed (poll result). */
  blockHeight: number;
};

/**
 * A contract call that has been assembled but not yet proven.
 *
 * `prove` is a method rather than raw bytes because proving is the ledger's
 * job, not ours: it walks the transaction's contract calls and drives the
 * prover per proof. Keeping it behind this interface means the ledger types
 * stay in `tx-assembler.ts` and this module only handles the serialized string
 * the wallet wants.
 */
export type AssembledCall = {
  circuitId: string;
  contractAddress: string;
  /** Prove the transaction and return it serialized, ready for balancing. */
  prove(provider: ProvingProvider): Promise<string>;
  /**
   * The unproven transaction, serialized. Nothing in the pipeline needs it —
   * it is here so an assembled call can be inspected or persisted before the
   * minutes-long proof, which is otherwise the only way to see one.
   */
  serializeUnproven(): string;
};

/** An assembled call plus the ledger state it would leave behind. */
export type AssembledCallWithState<S = unknown> = AssembledCall & {
  /**
   * The contract state this call produces, with the deployed operations (and
   * so the verifier keys) carried over from the state it ran against.
   *
   * Useful for chaining several calls before any of them confirms, and for
   * showing the borrower what their action will do before they pay for a proof.
   * It is a *prediction*: the chain decides, and a competing transaction can
   * land first.
   */
  nextContractState: S;
};

/**
 * Run one contract call to completion, reporting progress.
 *
 * Every step here is the real one; the only thing a caller supplies is how the
 * unproven transaction gets built.
 */
export async function submitContractCall(
  api: ConnectedAPI,
  config: ServiceConfig,
  assembleCall: () => Promise<AssembledCall>,
  onProgress: (p: ProofProgress) => void,
): Promise<SubmitResult> {
  let call: AssembledCall | undefined;
  let provenTx: string | undefined;
  let balancedTx: string | undefined;
  let blockHeight = 0;

  await runWithProgress(
    [
      {
        phase: "building",
        run: async () => {
          // Cheap pre-flight: refuse before spending a minute on a proof the
          // wallet then cannot pay to submit.
          const fees = await readFeeState(api);
          assertCanPayFees(fees);
          call = await assembleCall();
        },
      },
      {
        phase: "proving",
        run: async () => {
          const prover = await getProvingProvider(api, config);
          provenTx = await call!.prove(prover);
        },
      },
      {
        phase: "balancing",
        run: async () => {
          const { tx } = await api.balanceUnsealedTransaction(provenTx!, { payFees: true });
          balancedTx = tx;
        },
      },
      {
        phase: "submitting",
        run: async () => {
          await api.submitTransaction(balancedTx!);
        },
      },
      {
        phase: "confirming",
        run: async () => {
          const state = await queryContractState(config, call!.contractAddress);
          blockHeight = state?.blockHeight ?? 0;
        },
      },
    ],
    onProgress,
  );

  return { txSubmitted: true, blockHeight };
}
