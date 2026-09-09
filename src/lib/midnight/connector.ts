// defi1 — Midnight wallet connection via the DApp Connector API.
//
// Wallets inject one or more `InitialAPI` instances under `window.midnight`,
// keyed by UUID. Never hardcode a key — enumerate. The connector API has no
// explicit "disconnect"; a DApp disconnects by dropping the ConnectedAPI
// reference and clearing its own state (see `useWallet`).

import "@midnight-ntwrk/dapp-connector-api"; // side effect: augments window.midnight
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";
import { configFromWallet, DEFAULT_NETWORK, type NetworkId, type ServiceConfig } from "./config";

export type WalletInfo = {
  key: string;
  rdns: string;
  name: string;
  icon: string;
  apiVersion: string;
};

export class WalletNotFoundError extends Error {
  constructor() {
    super("No Midnight wallet found. Install a Midnight wallet extension and refresh.");
    this.name = "WalletNotFoundError";
  }
}

export function listWallets(): { info: WalletInfo; api: InitialAPI }[] {
  const injected = typeof window !== "undefined" ? window.midnight : undefined;
  if (!injected) return [];
  return Object.entries(injected).map(([key, api]) => ({
    info: { key, rdns: api.rdns, name: api.name, icon: api.icon, apiVersion: api.apiVersion },
    api,
  }));
}

// `listWallets()` builds a fresh array each call, which `useSyncExternalStore`
// would read as a new value on every render. Cache it, keyed on which wallet
// UUIDs are injected, so the snapshot is referentially stable.
let cachedInfos: WalletInfo[] = [];
let cachedKey: string | null = null;
const NO_WALLETS: WalletInfo[] = [];

/** Referentially stable list of injected wallets. */
export function walletsSnapshot(): WalletInfo[] {
  const injected = typeof window !== "undefined" ? window.midnight : undefined;
  const key = injected ? Object.keys(injected).sort().join(",") : "";
  if (key !== cachedKey) {
    cachedKey = key;
    cachedInfos = key === "" ? NO_WALLETS : listWallets().map((w) => w.info);
  }
  return cachedInfos;
}

/** On the server nothing is injected, so the snapshot is empty. */
export function walletsServerSnapshot(): WalletInfo[] {
  return NO_WALLETS;
}

/**
 * Wallets inject themselves before hydration and the connector API has no
 * "wallet appeared" event, so there is nothing to subscribe to — the snapshot
 * React reads after hydration is the final one.
 */
export function subscribeWallets(): () => void {
  return () => {};
}

export function pickWallet(rdns?: string): InitialAPI {
  const wallets = listWallets();
  if (wallets.length === 0) throw new WalletNotFoundError();
  if (rdns) {
    const match = wallets.find((w) => w.info.rdns === rdns);
    if (!match) throw new WalletNotFoundError();
    return match.api;
  }
  return wallets[0].api;
}

export type Connection = {
  api: ConnectedAPI;
  /** Unshielded address, Bech32m. */
  address: string;
  config: ServiceConfig;
  wallet: WalletInfo;
};

export async function connect(opts?: { networkId?: NetworkId; rdns?: string }): Promise<Connection> {
  const networkId = opts?.networkId ?? DEFAULT_NETWORK;
  const initial = pickWallet(opts?.rdns);
  const api = await initial.connect(networkId);

  const status = await api.getConnectionStatus();
  if (status.status !== "connected") {
    throw new Error("wallet did not confirm the connection");
  }

  const [{ unshieldedAddress }, walletConfig] = await Promise.all([
    api.getUnshieldedAddress(),
    api.getConfiguration(),
  ]);

  if (walletConfig.networkId !== networkId) {
    throw new Error(
      `wallet is on "${walletConfig.networkId}" but the app expects "${networkId}" — switch networks in the wallet`,
    );
  }

  return {
    api,
    address: unshieldedAddress,
    config: configFromWallet(walletConfig),
    wallet: {
      key: "",
      rdns: initial.rdns,
      name: initial.name,
      icon: initial.icon,
      apiVersion: initial.apiVersion,
    },
  };
}

export async function connectionStatus(api: ConnectedAPI): Promise<"connected" | "disconnected"> {
  try {
    return (await api.getConnectionStatus()).status;
  } catch {
    return "disconnected";
  }
}

export type DustState = { balance: bigint; cap: bigint };

/** DUST is the non-transferable fee resource. Surface it without leaking amounts elsewhere. */
export async function dustState(api: ConnectedAPI): Promise<DustState> {
  const { balance, cap } = await api.getDustBalance();
  return { balance, cap };
}
