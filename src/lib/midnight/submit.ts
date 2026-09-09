// defi1 — the "prove → pay fees → submit → confirm" pipeline.
//
// Composes the DApp Connector API's proving, balancing and relay methods with
// the `proof-server.ts` phase machine so every borrow / repay call renders the
// same progress UI.
//
// The wallet does the expensive parts: `getProvingProvider` returns a prover
// bound to our compiled circuit assets, `balanceUnsealedTransaction` pays DUST
// fees and fixes imbalances, `submitTransaction` relays.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import { assertCanPayFees, readFeeState } from "./fees";
import { getProvingProvider, queryContractState } from "./providers";
import { runWithProgress, type ProofProgress } from "./proof-server";

export type SubmitResult = {
  txSubmitted: true;
  /** Latest ledger state after the call landed (poll result). */
  blockHeight: number;
};

export type UnprovenCall = {
  /** Serialized unproven contract-call transaction (from tx assembly). */
  unprovenTx: string;
  /** Circuit key location so the prover loads the right keys. */
  circuitId: string;
  /** Contract address to poll after submit. */
  contractAddress: string;
};

/**
 * Run one contract call to completion, reporting progress.
 *
 * `assembleCall` is the single step that still needs transaction assembly
 * (`@midnight-ntwrk/midnight-js-contracts`, or hand-rolled `ledger-v8`). It
 * receives nothing and returns the unproven transaction; everything after it —
 * proving, fee payment, relay, confirmation — is wired here.
 */
export async function submitContractCall(
  api: ConnectedAPI,
  config: ServiceConfig,
  assembleCall: () => Promise<UnprovenCall>,
  onProgress: (p: ProofProgress) => void,
): Promise<SubmitResult> {
  let call: UnprovenCall | undefined;
  let provenTx: string | undefined;
  let balancedTx: string | undefined;
  let blockHeight = 0;

  await runWithProgress(
    [
      {
        phase: "building",
        run: async () => {
          const fees = await readFeeState(api);
          assertCanPayFees(fees);
          call = await assembleCall();
        },
      },
      {
        phase: "proving",
        run: async () => {
          const prover = await getProvingProvider(api, config);
          const bytes = new TextEncoder().encode(call!.unprovenTx);
          const proof = await prover.prove(bytes, call!.circuitId);
          provenTx = new TextDecoder().decode(proof);
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
