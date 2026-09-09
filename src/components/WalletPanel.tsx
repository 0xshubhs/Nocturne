"use client";

// defi1 — connect / status / DUST / proof-server panel. Minimal styling; this
// is the wiring surface for the borrower + pool views (plan.md §6).

import { useWallet } from "@/lib/midnight";

function short(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 10)}…${addr.slice(-6)}` : addr;
}

export function WalletPanel() {
  const { status, address, error, dust, proofServer, availableWallets, connect, disconnect, refresh } =
    useWallet();

  return (
    <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-5 text-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">Midnight wallet</span>
        <span
          className={
            status === "connected"
              ? "text-green-600"
              : status === "error"
                ? "text-red-600"
                : "text-zinc-500"
          }
        >
          {status}
        </span>
      </div>

      {status !== "connected" ? (
        <>
          <p className="text-zinc-500">
            {availableWallets.length === 0
              ? "No Midnight wallet detected — install an extension and refresh."
              : `Detected: ${availableWallets.map((w) => w.name).join(", ")}`}
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={status === "connecting"}
            className="h-10 rounded-full bg-foreground text-background disabled:opacity-50"
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
          {error && <p className="text-red-600">{error}</p>}
        </>
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-zinc-500">Address</span>
            <code title={address ?? ""}>{address ? short(address) : "—"}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">DUST (fees)</span>
            <span>{dust ? `${dust.balance} / cap ${dust.cap}` : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Proof server</span>
            <span className={proofServer?.ok ? "text-green-600" : "text-amber-600"}>
              {proofServer ? proofServer.detail : "checking…"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="h-9 flex-1 rounded-full border border-black/10 dark:border-white/15"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="h-9 flex-1 rounded-full border border-black/10 dark:border-white/15"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
