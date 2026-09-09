// defi1 — Midnight integration layer (plan.md §3).
//
//   config          network + service endpoints, wallet-config merge
//   connector       DApp Connector API: list / connect / status / DUST
//   private-state   AES-GCM encrypted store keyed to the wallet
//   codec           bigint + Uint8Array-safe JSON
//   lending         borrower private-state shape + typed store wrapper
//   proof-server    health check + submit-and-wait phase machine
//   providers       SDK-free ZK key material + indexer reads
//   use-wallet      React context / hook

export * from "./config";
export * from "./connector";
export * from "./private-state";
export * from "./codec";
export * from "./lending";
export * from "./signing";
export * from "./fees";
export * from "./proof-server";
export * from "./providers";
export * from "./submit";
export * from "./lending-client";
export { WalletProvider, useWallet } from "./use-wallet";
export type { WalletStatus } from "./use-wallet";
