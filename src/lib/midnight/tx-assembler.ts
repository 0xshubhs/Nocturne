// defi1 — transaction assembly (plan.md §3, the last seam).
//
// Turns a circuit call into an unproven ledger transaction, using the same
// compiled contract the test suite runs (`@defi1/contracts`) so the two cannot
// drift.
//
// This module is the *only* one that touches the ledger and onchain-runtime
// WASM, and it is deliberately kept out of `index.ts`. Demo mode never imports
// it, so a browser that only wants the walkthrough never pays for the runtime.
//
// The pipeline, and who does which part:
//
//   1. Read the deployed contract state from the indexer (us).
//   2. Run the circuit locally against that state, producing a call trace —
//      public transcript, private transcript, input, output (compact-runtime).
//   3. Partition the transcript into guaranteed/fallible segments, build a
//      `ContractCallPrototype`, wrap it in an `Intent`, and assemble an
//      unproven `Transaction` (midnight-js-contracts). This is the part worth
//      taking from the library: the partitioning has to be byte-exact with what
//      the chain will re-derive, and the key location has to embed the deployed
//      verifier key's hash.
//   4. Prove it — delegated to the *wallet* via the connector's
//      `getProvingProvider`, not to a standalone proof server.
//   5. Balance, pay DUST fees, submit (the wallet again; see `submit.ts`).
//
// Step 4 is why this does not use `midnight-js`'s own `submitCallTx`: that
// path proves through a `ProofProvider` pointed at a proof server, whereas a
// connector-based DApp should let the wallet prove, so the user's keys and
// proving preferences stay in the wallet.

import type { ConnectedAPI, ProvingProvider } from "@midnight-ntwrk/dapp-connector-api";
import {
  Contract,
  witnesses,
  type CircuitId,
  type DefiPrivateState,
} from "@defi1/contracts";
import { sampleSigningKey } from "@midnight-ntwrk/compact-runtime";
import { getNetworkId, setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import {
  createUnprovenCallTxFromInitialStates,
  createUnprovenDeployTxFromVerifierKeys,
} from "@midnight-ntwrk/midnight-js-contracts";
import * as CompiledContract from "@midnight-ntwrk/compact-js/effect/CompiledContract";
import {
  CostModel,
  LedgerParameters,
  ZswapChainState,
  type ProvingKeyMaterial,
  type ProvingProvider as LedgerProvingProvider,
} from "@midnightntwrk/ledger-v9";
import { deserializeCompactContractState } from "@midnight-ntwrk/midnight-js-utils";
import type { ContractState as CompactContractState } from "@midnight-ntwrk/compact-runtime";
import { ChargedState } from "@midnightntwrk/onchain-runtime-v4";
import { ZK_ASSET_BASE_PATH, type ServiceConfig } from "./config";
import { HttpZKConfigProvider } from "./zk-config";
import { queryContractState } from "./providers";
import type { BorrowerPrivateState } from "./lending";
import type { AssembledCall, AssembledCallWithState } from "./submit";

/** What a deploy produces, before it is proven and submitted. */
export type AssembledDeploy = AssembledCall & {
  /** The address the contract will occupy once the transaction lands. */
  contractAddress: string;
  /**
   * The ledger state the deployment installs — the same thing the indexer will
   * return for this address once the transaction is confirmed. Its operations
   * carry the verifier keys that every later call's key location hashes.
   */
  initialContractState: CompactContractState;
  /**
   * The contract maintenance authority's signing key. Whoever holds it can
   * later replace verifier keys or the authority itself — persist it if the
   * deployment is meant to be upgradable, and treat it as a secret.
   */
  signingKey: string;
};

/** Builds unproven contract transactions. */
export interface TxAssembler {
  call(
    contractAddress: string,
    circuitId: CircuitId,
    args: readonly unknown[],
    privateState: BorrowerPrivateState,
  ): Promise<AssembledCallWithState<CompactContractState>>;

  deploy(
    issuerSecret: Uint8Array,
    privateState: BorrowerPrivateState,
  ): Promise<AssembledDeploy>;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex string has an odd length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export class ContractNotDeployedError extends Error {
  constructor(address: string) {
    super(
      `no contract state at ${address} — the indexer has no record of it. ` +
        "Deploy the contract, or point the app at the network it is deployed on.",
    );
    this.name = "ContractNotDeployedError";
  }
}

/**
 * The compiled contract, wrapped for the assembler.
 *
 * `witnesses` supplies the private inputs at proving time; they run locally and
 * never leave the device.
 *
 * `withCompiledFileAssets` discharges a type-level requirement, not a runtime
 * one: when assembly is driven by a `ZKConfigProvider` (as it is here) the
 * adapter reads verifier keys through that provider and never consults the
 * path. It is set to where the assets really are served from in the browser so
 * that, if anything ever does read it, it is not a lie.
 */
const COMPILED = CompiledContract.make<Contract<DefiPrivateState>, DefiPrivateState>(
  "lending",
  Contract,
).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(ZK_ASSET_BASE_PATH),
);

/**
 * Adapt the wallet's prover to the one the ledger wants.
 *
 * They agree on `check` and `prove`, but ledger-v9 also asks for `lookupKey`,
 * which the DApp Connector API v4 does not provide — its `ProvingProvider` is
 * specified against an older ledger. The key material is ours anyway (it is the
 * compiler output we serve from `public/zk/`), so this fills the gap rather
 * than blocking on a connector revision.
 */
function asLedgerProvingProvider(
  wallet: ProvingProvider,
  zkConfig: HttpZKConfigProvider,
): LedgerProvingProvider {
  return {
    check: (preimage, keyLocation) => wallet.check(preimage, keyLocation),
    prove: (preimage, keyLocation, overwriteBindingInput) =>
      wallet.prove(preimage, keyLocation, overwriteBindingInput),
    lookupKey: async (keyLocation): Promise<ProvingKeyMaterial | undefined> => {
      try {
        const [proverKey, verifierKey, ir] = await Promise.all([
          zkConfig.getProverKey(keyLocation),
          zkConfig.getVerifierKey(keyLocation),
          zkConfig.getZKIR(keyLocation),
        ]);
        return { proverKey, verifierKey, ir };
      } catch {
        // The ledger treats `undefined` as "no key material here", which is the
        // honest answer for a location we hold no artifacts for.
        return undefined;
      }
    },
  };
}

export type TxAssemblerOptions = {
  api: ConnectedAPI;
  config: ServiceConfig;
  fetchImpl?: typeof fetch;
};

/**
 * midnight-js keeps the network id in a module-level global, and address
 * encoding and transaction assembly both read it. Set it from our config before
 * any assembly, and refuse to change it underneath a running session — two
 * networks in one page would silently produce transactions for the wrong chain.
 */
function configureNetwork(networkId: string): void {
  let current: string | undefined;
  try {
    current = getNetworkId();
  } catch {
    current = undefined; // not configured yet
  }
  if (current === undefined) {
    setNetworkId(networkId);
    return;
  }
  if (current !== networkId) {
    throw new Error(
      `network is already set to "${current}" and cannot be changed to "${networkId}" ` +
        "in the same session — reload the page after switching networks",
    );
  }
}

export class MidnightTxAssembler implements TxAssembler {
  private constructor(
    private readonly api: ConnectedAPI,
    private readonly config: ServiceConfig,
    private readonly zkConfig: HttpZKConfigProvider,
    private readonly coinPublicKey: string,
    private readonly encryptionPublicKey: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  static async create(opts: TxAssemblerOptions): Promise<MidnightTxAssembler> {
    configureNetwork(opts.config.networkId);
    const fetchImpl = opts.fetchImpl ?? fetch;
    // Coin and encryption public keys identify who receives any shielded output
    // the call produces. This contract makes none, but assembly needs them.
    const { shieldedCoinPublicKey, shieldedEncryptionPublicKey } =
      await opts.api.getShieldedAddresses();

    return new MidnightTxAssembler(
      opts.api,
      opts.config,
      new HttpZKConfigProvider(opts.config.zkAssetBasePath, fetchImpl),
      shieldedCoinPublicKey,
      shieldedEncryptionPublicKey,
      fetchImpl,
    );
  }

  async call(
    contractAddress: string,
    circuitId: CircuitId,
    args: readonly unknown[],
    privateState: BorrowerPrivateState,
  ): Promise<AssembledCallWithState<CompactContractState>> {
    const onChain = await queryContractState(this.config, contractAddress, this.fetchImpl);
    if (!onChain) throw new ContractNotDeployedError(contractAddress);

    // The state the circuit runs against, and the state whose operations carry
    // the deployed verifier keys the call's key location hashes.
    const initialContractState = deserializeCompactContractState(fromHex(onChain.data), {
      caller: "defi1:MidnightTxAssembler.call",
    });

    const options = {
      compiledContract: COMPILED,
      circuitId,
      contractAddress,
      args,
      initialPrivateState: privateState as DefiPrivateState,
      initialContractState,
      // This contract performs no Zswap coin operations, so it owns no shielded
      // coins and its chain state is empty. If a circuit ever mints or spends
      // one, this has to come from the indexer instead.
      initialZswapChainState: new ZswapChainState(),
      ledgerParameters: LedgerParameters.initialParameters(),
      coinPublicKey: this.coinPublicKey,
    };

    // `CompiledContract` is invariant in its contract type, and the library's
    // bound is `Contract<any>`. Our generated class satisfies that interface
    // structurally — `witnesses`, `circuits`, `provableCircuits`,
    // `initialState` are all present — but it also carries an extra
    // `impureCircuits`, which makes the two non-comparable in the direction TS
    // checks. The branded `ProvableCircuitId` is the same story. This is a
    // typing artifact at the library boundary, not a shape mismatch; the
    // assembler's own signature above keeps the call site honestly typed.
    const data = await createUnprovenCallTxFromInitialStates(
      this.zkConfig,
      options as unknown as Parameters<typeof createUnprovenCallTxFromInitialStates>[1],
      this.encryptionPublicKey as Parameters<typeof createUnprovenCallTxFromInitialStates>[2],
    );

    const unprovenTx = data.private.unprovenTx;

    // The state this call would leave behind. Only the ledger *data* changes;
    // the operations — and so the verifier keys a later call's key location
    // hashes — carry over from the state it ran against.
    const nextContractState = deserializeCompactContractState(fromHex(onChain.data), {
      caller: "defi1:MidnightTxAssembler.call:next",
    });
    nextContractState.data = new ChargedState(data.public.nextContractState);

    return {
      circuitId,
      contractAddress,
      nextContractState,
      prove: (provider) => this.proveAndSerialize(unprovenTx, provider),
      serializeUnproven: () => toHex(unprovenTx.serialize()),
    };
  }

  /**
   * Assemble the deployment. `issuerSecret` is the constructor argument — it
   * sets `issuerPk`, so whoever deploys becomes the attestation issuer.
   *
   * The returned `contractAddress` is where the contract *will* live; it is
   * derived from the deploy transaction, so it is known before submission.
   */
  async deploy(
    issuerSecret: Uint8Array,
    privateState: BorrowerPrivateState,
  ): Promise<AssembledDeploy> {
    // The contract maintenance authority. Sampled per deployment and handed
    // back to the caller — it is the only key that can later replace this
    // contract's verifier keys.
    const signingKey = sampleSigningKey();

    const options = {
      compiledContract: COMPILED,
      args: [issuerSecret],
      signingKey,
      initialPrivateState: privateState as DefiPrivateState,
    };

    const data = await createUnprovenDeployTxFromVerifierKeys(
      this.zkConfig,
      this.coinPublicKey as Parameters<typeof createUnprovenDeployTxFromVerifierKeys>[1],
      // Same invariance story as `call` — see the note there.
      options as unknown as Parameters<typeof createUnprovenDeployTxFromVerifierKeys>[2],
      this.encryptionPublicKey as Parameters<typeof createUnprovenDeployTxFromVerifierKeys>[3],
    );

    const unprovenTx = data.private.unprovenTx;
    const contractAddress = String(data.public.contractAddress);

    return {
      circuitId: "constructor",
      contractAddress,
      signingKey: String(signingKey),
      initialContractState: data.public.initialContractState as unknown as CompactContractState,
      prove: (provider) => this.proveAndSerialize(unprovenTx, provider),
      serializeUnproven: () => toHex(unprovenTx.serialize()),
    };
  }

  /**
   * Drive the wallet's prover over every contract call in the transaction, then
   * serialize for `balanceUnsealedTransaction`.
   */
  private async proveAndSerialize(
    unprovenTx: {
      prove(p: LedgerProvingProvider, c: CostModel): Promise<{ serialize(): Uint8Array }>;
      serialize(): Uint8Array;
    },
    provider: ProvingProvider,
  ): Promise<string> {
    const proven = await unprovenTx.prove(
      asLedgerProvingProvider(provider, this.zkConfig),
      CostModel.initialCostModel(),
    );
    return toHex(proven.serialize());
  }
}

/**
 * Serialize a contract state the way the indexer publishes it, so a state
 * produced locally can be fed back through the same path a fetched one takes.
 */
export function serializeContractStateHex(state: CompactContractState): string {
  return toHex(state.serialize());
}

export { toHex as serializeHex, fromHex as parseHex };
