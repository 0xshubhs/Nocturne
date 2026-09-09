"use client";

// Nocturne — the landing page.
//
// One job: make a stranger understand, in about fifteen seconds, that this
// lets you borrow against a credit score nobody can read — and that the claim
// is demonstrable rather than aspirational. Everything here either states the
// problem, shows the mechanism, or gets out of the way.

import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { TIER_RULES, formatBps, maxBorrow } from "@/lib/midnight/score";

function Moon({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="noct-hero-moon" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#d4d6ff" />
          <stop offset="100%" stopColor="#8f93e6" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#noct-hero-moon)" />
      <circle cx="16.5" cy="9.5" r="8" fill="var(--bg)" />
    </svg>
  );
}

/** The comparison the whole product exists to make. */
function Ledger() {
  const rows: Array<{ k: string; chain: string; you: string; tone: "public" | "private" }> = [
    { k: "who you are", chain: "a 32-byte nullifier", you: "Alice", tone: "private" },
    { k: "your credit score", chain: "no such field", you: "1,210", tone: "private" },
    { k: "your bank balance", chain: "no such field", you: "band 200", tone: "private" },
    { k: "your linked wallet", chain: "never submitted", you: "0x3252…be90", tone: "private" },
    { k: "the tier you cleared", chain: "1", you: "1", tone: "public" },
    { k: "how much you borrowed", chain: "1,500", you: "1,500", tone: "public" },
  ];

  return (
    <div className="rounded-2xl border border-border/70 bg-bg-raised/60 overflow-hidden backdrop-blur-sm">
      <div className="grid grid-cols-[1fr_auto_1fr] text-[10px] uppercase tracking-[0.08em] border-b border-border/60">
        <div className="px-5 py-3 text-public font-semibold">What the chain sees</div>
        <div className="w-px bg-border/60" />
        <div className="px-5 py-3 text-private font-semibold">What you know</div>
      </div>
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[1fr_auto_1fr] border-b border-border/40 last:border-0">
          <div className="px-5 py-3">
            <div className="text-[10px] text-fg-dim uppercase tracking-wide">{r.k}</div>
            <div
              className={`mt-1 font-mono text-sm ${
                r.tone === "private" ? "text-fg-dim" : "text-public"
              }`}
            >
              {r.tone === "private" ? <span className="tracking-widest select-none">▓▓▓▓▓▓</span> : r.chain}
            </div>
            {r.tone === "private" && <div className="text-[10px] text-fg-dim mt-0.5">{r.chain}</div>}
          </div>
          <div className="w-px bg-border/40" />
          <div className="px-5 py-3">
            <div className="text-[10px] text-fg-dim uppercase tracking-wide">{r.k}</div>
            <div className={`mt-1 font-mono text-sm ${r.tone === "private" ? "text-private" : "text-public"}`}>
              {r.you}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-[11px] font-mono text-accent">
          {n}
        </span>
        <h3 className="font-display text-[17px]">{title}</h3>
      </div>
      <p className="text-sm text-fg-muted leading-relaxed pl-[34px]">{children}</p>
    </div>
  );
}

export function Landing() {
  const tier0 = maxBorrow(1000n, 0);
  const tier1 = maxBorrow(1000n, 1);

  return (
    <div className="min-h-screen bg-bg bg-moonlight">
      <header className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon className="h-6 w-6" />
          <span className="font-display text-lg">{BRAND.name}</span>
        </div>
        <Link
          href="/app"
          className="h-9 px-4 rounded-full text-xs font-medium border border-border-strong text-fg-muted hover:text-fg hover:border-fg-dim hover:bg-bg-hover transition-colors flex items-center"
        >
          Open the demo
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        {/* hero */}
        <section className="pt-20 pb-16 animate-rise">
          <div className="flex items-center gap-2 text-[11px] text-fg-dim mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-private animate-breathe" />
            Built on Midnight · zero-knowledge by construction
          </div>

          <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] max-w-3xl">
            Borrow against a credit score
            <br />
            <span className="text-accent">no one can read.</span>
          </h1>

          <p className="mt-7 text-lg text-fg-muted leading-relaxed max-w-2xl">
            On-chain lending asks for 150% collateral because a lender cannot judge you without
            you handing over your whole financial life. Nocturne removes the trade: your score is
            computed on your device, and the chain is told exactly one thing about it.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/app"
              className="h-11 px-6 rounded-full bg-accent text-[#0b0c16] font-semibold text-sm hover:brightness-110 transition-all flex items-center"
            >
              Try the demo
            </Link>
            <Link
              href="/app#explorer"
              className="h-11 px-6 rounded-full border border-border-strong text-sm text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors flex items-center"
            >
              See what the chain sees
            </Link>
          </div>
        </section>

        {/* the claim, made concrete */}
        <section className="py-12">
          <div className="rule-fade mb-12" />
          <div className="grid md:grid-cols-[1.1fr_1fr] gap-10 items-start">
            <div>
              <h2 className="font-display text-3xl leading-tight">
                Same collateral.
                <br />
                Three times the loan.
              </h2>
              <p className="mt-5 text-sm text-fg-muted leading-relaxed">
                Alice and Bob each post <span className="font-mono text-fg">1,000</span>. Alice
                draws <span className="font-mono text-private">{tier1.toLocaleString()}</span>;
                Bob draws <span className="font-mono text-public">{tier0.toLocaleString()}</span>.
                The difference is Alice&apos;s private score — and the ledger records only that
                someone cleared a higher threshold.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {([0, 1] as const).map((t) => (
                  <div key={t} className="rounded-xl border border-border/70 bg-bg-inset/60 px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-fg-dim">Tier {t}</div>
                    <div className="mt-1 font-mono text-xl">{formatBps(TIER_RULES[t].maxLtvBps)}</div>
                    <div className="text-[11px] text-fg-dim mt-0.5">
                      max LTV · {formatBps(TIER_RULES[t].aprBps)} APR
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Ledger />
          </div>
        </section>

        {/* mechanism */}
        <section className="py-12">
          <div className="rule-fade mb-12" />
          <h2 className="font-display text-3xl mb-10">How it works</h2>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-9">
            <Step n="1" title="Collect attestations">
              A bank, a payroll provider and a credit bureau each sign a band — not a figure. Only
              the commitment hash reaches the chain.
            </Step>
            <Step n="2" title="Link a wallet, privately">
              Prove you control an address on another chain with a signature. An oracle turns its
              public history into a bounded score contribution and attests it. You never mint your
              own score.
            </Step>
            <Step n="3" title="Prove one bit">
              The circuit computes your score over private data and asserts a single boolean:
              it clears the tier. Not the score. Not the inputs.
            </Step>
            <Step n="4" title="Borrow">
              A nullifier stands in for you — one active loan per identity. Default is the only
              event that reveals anything, and it reveals one pseudonym.
            </Step>
          </div>
        </section>

        {/* honesty */}
        <section className="py-12">
          <div className="rule-fade mb-12" />
          <div className="rounded-2xl border border-border/70 bg-bg-raised/40 p-7">
            <h2 className="font-display text-2xl">What&apos;s actually built</h2>
            <div className="mt-5 grid sm:grid-cols-3 gap-5 text-sm">
              <div>
                <div className="font-mono text-2xl text-private">168</div>
                <p className="text-fg-dim mt-1 leading-relaxed">
                  tests green across the contract and the app
                </p>
              </div>
              <div>
                <div className="font-mono text-2xl text-private">12.9s</div>
                <p className="text-fg-dim mt-1 leading-relaxed">
                  to prove a real borrow against a live proof server
                </p>
              </div>
              <div>
                <div className="font-mono text-2xl text-public">1</div>
                <p className="text-fg-dim mt-1 leading-relaxed">
                  step left: submitting to a live network
                </p>
              </div>
            </div>
            <p className="mt-6 text-xs text-fg-dim leading-relaxed max-w-2xl">
              The contract compiles under Compact 0.23 with all six circuits keyed. Transaction
              assembly and proving are verified end to end. Balancing and submission need a funded
              wallet, and are not yet done — the demo says so rather than pretending otherwise.
            </p>
          </div>
        </section>

        <footer className="py-14 flex items-center justify-between text-xs text-fg-dim border-t border-border/40 mt-8">
          <span>
            {BRAND.name} · {BRAND.tagline}
          </span>
          <Link href="/app" className="hover:text-fg-muted transition-colors">
            Open the demo →
          </Link>
        </footer>
      </main>
    </div>
  );
}
