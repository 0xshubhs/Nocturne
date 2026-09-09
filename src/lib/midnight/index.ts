// Nocturne — Midnight integration layer (plan.md §3).
//
//   config          network + service endpoints, wallet-config merge
//   score           credit score, tier table, LTV + term rules (circuit mirror)
//   cross-chain     external-wallet ownership proof + history import
//   connector       DApp Connector API: list / connect / status / DUST
//   private-state   AES-GCM encrypted store keyed to the wallet
//   codec           bigint + Uint8Array-safe JSON
//   lending         borrower private-state shape + typed store wrapper
//   proof-server    health check + submit-and-wait phase machine
//   providers       SDK-free ZK key material + indexer reads
//   live            the on-chain path: real assembly, real proofs (lazy WASM)
//   use-wallet      React context / hook
//
// `tx-assembler` is deliberately NOT re-exported here: it reaches the ledger
// and onchain-runtime WASM, and `live.ts` imports it lazily so demo mode never
// pays for it. Import it directly if you need the assembler itself.

export * from "./config";
export * from "./score";
export * from "./cross-chain";
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
export * from "./live";
export { WalletProvider, useWallet } from "./use-wallet";
export type { WalletStatus } from "./use-wallet";
