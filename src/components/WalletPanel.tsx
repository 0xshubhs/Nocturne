"use client";

// defi1 — wallet detail, shown from the header button once connected.
//
// Everything here belongs to the live path (plan.md §3): the unshielded
// address, the DUST balance that pays for a proof, and whether the local proof
// server is actually reachable. In demo mode none of it is needed, which is
// why it lives behind the address rather than on the dashboard.

import { useWallet } from "@/lib/midnight";
import { Button, Pill, Row } from "./ui";

export function WalletPanel({ onClose }: { onClose?: () => void }) {
  const { status, address, error, dust, proofServer, availableWallets, connect, disconnect, refresh } =
    useWallet();

  if (status !== "connected") {
    return (
      <div className="w-72 rounded-xl border border-border bg-bg-raised p-4 flex flex-col gap-3 text-sm">
        <p className="text-xs text-fg-dim leading-relaxed">
          {availableWallets.length === 0
            ? "No Midnight wallet detected. The demo runs without one — connect only to exercise the live path."
            : `Detected: ${availableWallets.map((w) => w.name).join(", ")}`}
        </p>
        <Button
          variant="ghost"
          full
          onClick={() => void connect()}
          disabled={status === "connecting" || availableWallets.length === 0}
        >
          {status === "connecting" ? "Connecting…" : "Connect wallet"}
        </Button>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-72 rounded-xl border border-border bg-bg-raised p-4 flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-fg-dim">Connected</span>
        <Pill tone="private">live</Pill>
      </div>

      <Row label="Address">
        <span className="text-[11px]" title={address ?? ""}>
          {address ? `${address.slice(0, 12)}…${address.slice(-6)}` : "—"}
        </span>
      </Row>
      <Row label="DUST" tone="public">
        {dust ? `${dust.balance} / ${dust.cap}` : "—"}
      </Row>
      <Row label="Proof server" tone={proofServer?.ok ? "private" : "danger"}>
        <span className="text-[11px]">{proofServer ? (proofServer.ok ? "reachable" : "unreachable") : "checking…"}</span>
      </Row>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => void refresh()}>
          Refresh
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            disconnect();
            onClose?.();
          }}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}
