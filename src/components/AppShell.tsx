"use client";

// defi1 — dapp chrome: nav, network state, persona switch, demo clock.

import { useState, type ReactNode } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { useWallet } from "@/lib/midnight";
import { PERSONAS, PERSONA_IDS } from "@/lib/demo/personas";
import { DEFAULT_NETWORK } from "@/lib/midnight/config";
import { WalletPanel } from "./WalletPanel";
import { Pill, formatDate, shortAddress } from "./ui";

export type Tab = "borrow" | "pool" | "explorer";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "borrow", label: "Borrow" },
  { id: "pool", label: "Pool" },
  { id: "explorer", label: "Explorer" },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-private/15 border border-private/30">
        <span className="h-2 w-2 rounded-full bg-private" />
      </span>
      <div className="leading-none">
        <div className="text-sm font-semibold tracking-tight">defi1</div>
        <div className="text-[10px] text-fg-dim mt-0.5">ZK credit on Midnight</div>
      </div>
    </div>
  );
}

function WalletButton() {
  const { status, address, availableWallets } = useWallet();
  const [open, setOpen] = useState(false);

  const label =
    status === "connected" && address
      ? shortAddress(address, 5)
      : status === "connecting"
        ? "Connecting…"
        : "Connect wallet";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={
          status === "connected"
            ? (address ?? "")
            : availableWallets.length === 0
              ? "No Midnight wallet extension detected — the demo runs without one"
              : availableWallets.map((w) => w.name).join(", ")
        }
        className={`h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
          status === "connected"
            ? "border-private/30 bg-private/10 text-private font-mono"
            : "border-border-strong text-fg-muted hover:text-fg hover:border-fg-dim"
        }`}
      >
        {label}
      </button>
      {open && (
        <>
          {/* Click-away layer, so the panel closes like a real menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-20">
            <WalletPanel onClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({
  tab,
  onTab,
  children,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  children: ReactNode;
}) {
  const { state, persona, setActive, advanceTime, reset, busy } = useDemo();
  const [showClock, setShowClock] = useState(false);

  return (
    <div className="min-h-screen bg-bg bg-grid">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-5 h-14 flex items-center justify-between gap-4">
          <Logo />

          <nav className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-bg-inset border border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={`px-3.5 h-8 rounded-md text-xs font-medium transition-colors ${
                  tab === t.id ? "bg-white/10 text-fg" : "text-fg-dim hover:text-fg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Pill>{DEFAULT_NETWORK}</Pill>
            <WalletButton />
          </div>
        </div>

        {/* Persona + demo clock: the strip that makes the demo drivable. */}
        <div className="border-t border-border/60 bg-bg-raised/50">
          <div className="mx-auto max-w-6xl px-5 py-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-fg-dim">Acting as</span>
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-bg-inset border border-border">
                {PERSONA_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => setActive(id)}
                    className={`px-3 h-7 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                      persona.id === id ? "bg-private/15 text-private" : "text-fg-dim hover:text-fg-muted"
                    }`}
                  >
                    {PERSONAS[id].name}
                  </button>
                ))}
              </div>
              <span className="hidden md:inline text-xs text-fg-dim max-w-md truncate" title={persona.blurb}>
                {persona.blurb}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowClock((v) => !v)}
                className="text-xs font-mono text-fg-dim hover:text-fg-muted transition-colors"
                title="Simulated block time"
              >
                ⛓ {formatDate(state.ledger.blockTime)}
              </button>
              {showClock && (
                <div className="flex items-center gap-1">
                  {([1, 7, 31] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={busy}
                      onClick={() => advanceTime(BigInt(d) * 86400n)}
                      className="px-2 h-7 rounded-md border border-border text-xs text-fg-dim hover:text-fg hover:border-fg-dim transition-colors disabled:opacity-40"
                    >
                      +{d}d
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="px-2 h-7 rounded-md border border-border text-xs text-fg-dim hover:text-fg hover:border-fg-dim transition-colors disabled:opacity-40"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <nav className="sm:hidden border-t border-border/60 flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={`flex-1 h-10 text-xs font-medium transition-colors ${
                tab === t.id ? "text-fg border-b-2 border-private" : "text-fg-dim"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">{children}</main>

      <footer className="mx-auto max-w-6xl px-5 py-8 text-xs text-fg-dim leading-relaxed border-t border-border/60 mt-8">
        Demo mode: the ledger runs in your browser and the proof phases are paced rather than
        computed. The contract these rules mirror is compiled Compact —{" "}
        <code className="font-mono">npm --prefix contracts run demo</code> runs the same story
        against the real circuits.
      </footer>
    </div>
  );
}
