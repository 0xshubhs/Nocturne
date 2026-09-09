"use client";

// Nocturne — dapp chrome: nav, network state, persona switch, demo clock.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useDemo } from "@/lib/demo/use-demo";
import { useWallet } from "@/lib/midnight";
import { PERSONAS, PERSONA_IDS } from "@/lib/demo/personas";
import { DEFAULT_NETWORK } from "@/lib/midnight/config";
import { BRAND } from "@/lib/brand";
import { WalletPanel } from "./WalletPanel";
import { Pill, formatDate, shortAddress } from "./ui";

export type Tab = "borrow" | "pool" | "explorer";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "borrow", label: "Borrow" },
  { id: "pool", label: "Pool" },
  { id: "explorer", label: "Explorer" },
];

/** A waxing crescent — the mark for a protocol named after night music. */
function Moon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="noct-moon" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#c9cbff" />
          <stop offset="100%" stopColor="#8f93e6" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#noct-moon)" opacity="0.95" />
      <circle cx="16.5" cy="9.5" r="8" fill="var(--bg)" />
    </svg>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 group">
      <Moon />
      <div className="leading-none">
        <div className="font-display text-lg tracking-tight group-hover:text-accent transition-colors">
          {BRAND.name}
        </div>
        <div className="text-[10px] text-fg-dim mt-1 tracking-wide">{BRAND.tagline}</div>
      </div>
    </Link>
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
        className={`h-10 px-4 rounded-full border text-xs font-medium transition-colors ${
          status === "connected"
            ? "border-accent/30 bg-accent/10 text-accent font-mono"
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
    <div className="min-h-screen bg-bg bg-moonlight">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-4">
          <Logo />

          <nav className="hidden sm:flex items-center gap-0.5 p-1 rounded-xl bg-bg-inset/70 border border-border/70">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className={`px-4 h-8 rounded-lg text-xs font-medium transition-all ${
                  tab === t.id
                    ? "bg-accent/15 text-accent shadow-[0_0_0_1px_#a5a8f033]"
                    : "text-fg-dim hover:text-fg-muted"
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
        <div className="border-t border-border/40 bg-bg-raised/40">
          <div className="mx-auto max-w-6xl px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-fg-dim">Acting as</span>
              <div className="flex gap-0.5 p-1 rounded-xl bg-bg-inset/70 border border-border/70">
                {PERSONA_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => setActive(id)}
                    className={`px-3.5 h-7 rounded-lg text-xs font-medium transition-all disabled:opacity-40 ${
                      persona.id === id
                        ? "bg-private/12 text-private shadow-[0_0_0_1px_#7fdcb433]"
                        : "text-fg-dim hover:text-fg-muted"
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

      <main className="mx-auto max-w-6xl px-6 py-8 animate-rise">{children}</main>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-fg-dim leading-relaxed border-t border-border/40 mt-10">
        Demo mode: the ledger runs in your browser and the proof phases are paced rather than
        computed. The contract these rules mirror is compiled Compact —{" "}
        <code className="font-mono">npm --prefix contracts run demo</code> runs the same story
        against the real circuits.
      </footer>
    </div>
  );
}
