"use client";

// Nocturne — React context for the Midnight wallet connection.
//
// Provides connect / disconnect / address / status + a poll on connection
// status and DUST balance. Wrap the app in <WalletProvider> (see layout.tsx)
// and read it with useWallet().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  connect as connectWallet,
  connectionStatus,
  dustState,
  subscribeWallets,
  walletsServerSnapshot,
  walletsSnapshot,
  type Connection,
  type DustState,
  type WalletInfo,
} from "./connector";
import { DEFAULT_NETWORK, type NetworkId } from "./config";
import { checkProofServerHealth, type ProofServerHealth } from "./proof-server";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

type WalletContextValue = {
  status: WalletStatus;
  connection: Connection | null;
  address: string | null;
  error: string | null;
  dust: DustState | null;
  proofServer: ProofServerHealth | null;
  availableWallets: WalletInfo[];
  connect: (opts?: { networkId?: NetworkId; rdns?: string }) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const POLL_MS = 15_000;

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dust, setDust] = useState<DustState | null>(null);
  const [proofServer, setProofServer] = useState<ProofServerHealth | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // `window.midnight` only exists in the browser, so this is external state:
  // empty during SSR, populated on the client after hydration.
  const availableWallets = useSyncExternalStore(
    subscribeWallets,
    walletsSnapshot,
    walletsServerSnapshot,
  );

  const disconnect = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setConnection(null);
    setDust(null);
    setProofServer(null);
    setStatus("disconnected");
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setConnection((current) => {
      if (!current) return current;
      void (async () => {
        const live = await connectionStatus(current.api);
        if (live === "disconnected") {
          disconnect();
          return;
        }
        try {
          setDust(await dustState(current.api));
        } catch {
          /* wallet may not have granted the hint yet */
        }
        setProofServer(await checkProofServerHealth(current.config.proofServerUri));
      })();
      return current;
    });
  }, [disconnect]);

  const connect = useCallback(
    async (opts?: { networkId?: NetworkId; rdns?: string }) => {
      setStatus("connecting");
      setError(null);
      try {
        const conn = await connectWallet({ networkId: opts?.networkId ?? DEFAULT_NETWORK, rdns: opts?.rdns });
        setConnection(conn);
        setStatus("connected");
        try {
          setDust(await dustState(conn.api));
        } catch {
          /* optional */
        }
        setProofServer(await checkProofServerHealth(conn.config.proofServerUri));
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => void refresh(), POLL_MS);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  useEffect(() => () => void (pollRef.current && clearInterval(pollRef.current)), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      connection,
      address: connection?.address ?? null,
      error,
      dust,
      proofServer,
      availableWallets,
      connect,
      disconnect,
      refresh,
    }),
    [status, connection, error, dust, proofServer, availableWallets, connect, disconnect, refresh],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
