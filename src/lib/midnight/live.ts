// defi1 — the live path: a real wallet, a real contract, a real proof.
//
// Everything else in `lib/midnight` is either demo-safe or type-only. This is
// the one entry point that pulls in the ledger and onchain-runtime WASM, so it
// loads them lazily: a browser that only wants the demo never fetches them, and
// the cost is paid the first time someone actually goes on-chain.
//
// Usage, once a wallet is connected:
//
//   const client = await connectLending({ api, address, config });
//   const { contractAddress } = await client.deploy(issuerSecret, onProgress);
//   // ...or join one someone else deployed:
//   //   const client = await connectLending({ api, address, config, contractAddress });
//   await client.depositLiquidity(1_000_000n, onProgress);
//
// Requires `npm run compact` (for the contract bindings and keys) and
// `npm run sync:zk` (to serve them), plus a wallet on the same network as
// `config.networkId`.

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type { ServiceConfig } from "./config";
import { LendingClient, type TxAssembler } from "./lending-client";

export type ConnectLendingOptions = {
  api: ConnectedAPI;
  /** The wallet's unshielded address — scopes the encrypted private state. */
  address: string;
  config: ServiceConfig;
  /** Join an existing pool. Omit to `deploy()` a new one. */
  contractAddress?: string;
};

/**
 * Build a `LendingClient` backed by real transaction assembly.
 *
 * The dynamic import is deliberate: `tx-assembler` reaches the ledger WASM, and
 * demo mode must not pay for it.
 */
export async function connectLending(opts: ConnectLendingOptions): Promise<LendingClient> {
  const { MidnightTxAssembler } = await import("./tx-assembler");
  const assembler = (await MidnightTxAssembler.create({
    api: opts.api,
    config: opts.config,
  })) as unknown as TxAssembler;

  return LendingClient.create({
    api: opts.api,
    address: opts.address,
    config: opts.config,
    assembler,
    contractAddress: opts.contractAddress,
  });
}

/**
 * Pre-flight for the live path, so a failure reads as a missing prerequisite
 * rather than an opaque 404 halfway through assembly.
 *
 * Checks the two things that are ours to get wrong: the ZK artifacts are being
 * served, and the wallet agrees about the network.
 */
export async function checkLiveReadiness(
  api: ConnectedAPI,
  config: ServiceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ready: boolean; problems: string[] }> {
  const problems: string[] = [];

  try {
    const res = await fetchImpl(`${config.zkAssetBasePath}/keys/borrow.verifier`);
    if (!res.ok) {
      problems.push(
        `ZK artifacts are not being served from ${config.zkAssetBasePath} ` +
          "— run `npm run compact` then `npm run sync:zk`",
      );
    }
  } catch (err) {
    problems.push(`could not reach ${config.zkAssetBasePath}: ${String(err)}`);
  }

  try {
    const walletConfig = await api.getConfiguration();
    if (walletConfig.networkId !== config.networkId) {
      problems.push(
        `wallet is on "${walletConfig.networkId}" but the app targets "${config.networkId}"`,
      );
    }
  } catch (err) {
    problems.push(`could not read the wallet's configuration: ${String(err)}`);
  }

  return { ready: problems.length === 0, problems };
}
