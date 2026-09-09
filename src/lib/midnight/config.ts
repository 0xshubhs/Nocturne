// Nocturne — Midnight network + service configuration.
//
// A connected wallet reports its own service URIs via `getConfiguration()`; we
// prefer those (the user may have privacy/perf preferences) and fall back to
// the public endpoints for the selected network. The proof-server URL and the
// ZK-asset base path are ours, not the wallet's.

import type { Configuration } from "@midnight-ntwrk/dapp-connector-api";

export type NetworkId = "undeployed" | "preview" | "preprod" | "mainnet";

export type ServiceConfig = {
  networkId: NetworkId;
  indexerUri: string;
  indexerWsUri: string;
  substrateNodeUri: string;
  /** Self-hosted proof server — used for the health check and local proving. */
  proofServerUri: string;
  /** Base path the browser fetches prover/verifier keys + zkir from. */
  zkAssetBasePath: string;
};

// Public endpoints, from the Midnight support matrix.
const ENDPOINTS: Record<NetworkId, Pick<ServiceConfig, "indexerUri" | "indexerWsUri" | "substrateNodeUri">> = {
  undeployed: {
    indexerUri: "http://localhost:8088/api/v4/graphql",
    indexerWsUri: "ws://localhost:8088/api/v4/graphql/ws",
    substrateNodeUri: "ws://localhost:9944",
  },
  preview: {
    indexerUri: "https://indexer.preview.midnight.network/api/v4/graphql",
    indexerWsUri: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    substrateNodeUri: "wss://rpc.preview.midnight.network",
  },
  preprod: {
    indexerUri: "https://indexer.preprod.midnight.network/api/v4/graphql",
    indexerWsUri: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
    substrateNodeUri: "https://rpc.preprod.midnight.network",
  },
  mainnet: {
    indexerUri: "https://indexer.mainnet.midnight.network/api/v4/graphql",
    indexerWsUri: "wss://indexer.mainnet.midnight.network/api/v4/graphql/ws",
    substrateNodeUri: "https://rpc.mainnet.midnight.network",
  },
};

function env(key: string): string | undefined {
  // NEXT_PUBLIC_* is inlined at build time; guard for non-Next contexts (tests).
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}

export const DEFAULT_NETWORK: NetworkId =
  (env("NEXT_PUBLIC_MIDNIGHT_NETWORK") as NetworkId | undefined) ?? "preprod";

export const DEFAULT_PROOF_SERVER: string =
  env("NEXT_PUBLIC_PROOF_SERVER") ?? "http://127.0.0.1:6300";

/** Where `public/zk/lending/{keys,zkir}` is served from. Run `npm run sync:zk`. */
export const ZK_ASSET_BASE_PATH = "/zk/lending";

export function isNetworkId(v: string): v is NetworkId {
  return v === "undeployed" || v === "preview" || v === "preprod" || v === "mainnet";
}

export function defaultConfig(networkId: NetworkId = DEFAULT_NETWORK): ServiceConfig {
  return {
    networkId,
    ...ENDPOINTS[networkId],
    proofServerUri: DEFAULT_PROOF_SERVER,
    zkAssetBasePath: ZK_ASSET_BASE_PATH,
  };
}

/** Merge a connected wallet's reported service URIs over our defaults. */
export function configFromWallet(walletConfig: Configuration): ServiceConfig {
  const networkId = isNetworkId(walletConfig.networkId)
    ? walletConfig.networkId
    : DEFAULT_NETWORK;
  const base = defaultConfig(networkId);
  return {
    ...base,
    indexerUri: walletConfig.indexerUri || base.indexerUri,
    indexerWsUri: walletConfig.indexerWsUri || base.indexerWsUri,
    substrateNodeUri: walletConfig.substrateNodeUri || base.substrateNodeUri,
    // `proverServerUri` is deprecated in the connector API (proving now goes
    // through `getProvingProvider`); keep our own for the health check.
    proofServerUri: walletConfig.proverServerUri || base.proofServerUri,
  };
}
