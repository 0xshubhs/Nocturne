// defi1 — provider wiring that does NOT need the full midnight-js SDK.
//
//  - `FetchKeyMaterialProvider` serves the compiled ZK assets to the wallet's
//    `getProvingProvider()` (the connector API's own proving path).
//  - `queryContractState` reads public ledger state straight from the indexer's
//    GraphQL endpoint.
//
// The `deployContract` / `callTx` lifecycle from `@midnight-ntwrk/midnight-js-
// contracts` is wired in `contract.ts` once that dependency + a running
// network are available; this file is the SDK-free foundation it builds on.

import type { ConnectedAPI, KeyMaterialProvider, ProvingProvider } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";

/**
 * Resolves prover/verifier keys + zkir for a circuit by fetching from the
 * app's `public/zk/lending/` folder (populated by `npm run sync:zk`).
 */
export class FetchKeyMaterialProvider implements KeyMaterialProvider {
  constructor(
    private readonly basePath: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async bytes(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`ZK asset not found: ${url} (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async getProverKey(circuitKeyLocation: string): Promise<Uint8Array> {
    return this.bytes(`${this.basePath}/keys/${circuitKeyLocation}.prover`);
  }

  async getVerifierKey(circuitKeyLocation: string): Promise<Uint8Array> {
    return this.bytes(`${this.basePath}/keys/${circuitKeyLocation}.verifier`);
  }

  async getZKIR(circuitKeyLocation: string): Promise<Uint8Array> {
    try {
      return await this.bytes(`${this.basePath}/zkir/${circuitKeyLocation}.bzkir`);
    } catch {
      return this.bytes(`${this.basePath}/zkir/${circuitKeyLocation}.zkir`);
    }
  }
}

/** Ask the wallet to prove for us, using our compiled circuit assets. */
export async function getProvingProvider(
  api: ConnectedAPI,
  config: ServiceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ProvingProvider> {
  const keyMaterial = new FetchKeyMaterialProvider(config.zkAssetBasePath, fetchImpl);
  return api.getProvingProvider(keyMaterial);
}

export type ContractLedgerState = {
  /** hex-encoded serialized `ContractState.data`, feed to the generated `ledger()`. */
  data: string;
  blockHeight: number;
};

/**
 * Read a contract's public ledger state from the indexer. Deserialize with the
 * generated `ledger()` in `contract.ts`.
 */
export async function queryContractState(
  config: ServiceConfig,
  contractAddress: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ContractLedgerState | null> {
  const query = `
    query ContractState($address: HexEncoded!) {
      contractAction(address: $address) {
        __typename
        ... on ContractCall { state transaction { block { height } } }
        ... on ContractDeploy { state transaction { block { height } } }
        ... on ContractUpdate { state transaction { block { height } } }
      }
    }`;
  const res = await fetchImpl(config.indexerUri, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { address: contractAddress } }),
  });
  if (!res.ok) throw new Error(`indexer query failed (HTTP ${res.status})`);
  const body = (await res.json()) as {
    data?: { contractAction?: { state?: string; transaction?: { block?: { height?: number } } } };
    errors?: Array<{ message: string }>;
  };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  const action = body.data?.contractAction;
  if (!action?.state) return null;
  return { data: action.state, blockHeight: action.transaction?.block?.height ?? 0 };
}
