"use client";

// defi1 — the borrower's score and the tier it unlocks (plan.md §6).
//
// The number is on screen because it is *yours*. What a counterparty gets is
// the band, and only as a by-product of which tier you borrowed at. The card
// says so explicitly, because a demo that shows a score without that caveat
// teaches the wrong thing.

import { useDemo } from "@/lib/demo/use-demo";
import {
  formatBps,
  maxBorrow,
  scoreBand,
  tierProgress,
  TIER_RULES,
  type TierId,
} from "@/lib/midnight/score";
import { DEMO_COLLATERAL } from "@/lib/demo/personas";
import { Meter, Panel, Pill, Row, Stat, VisibilityTag, formatAmount } from "./ui";

function TierRow({ tier, unlocked }: { tier: TierId; unlocked: boolean }) {
  const rule = TIER_RULES[tier];
  return (
    <div
      className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
        unlocked ? "border-private/30 bg-private/[0.05]" : "border-border bg-bg-inset opacity-60"
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Tier {tier}</span>
          {unlocked ? <Pill tone="private">unlocked</Pill> : <Pill>locked</Pill>}
        </div>
        <div className="text-xs text-fg-dim mt-0.5 font-mono tnum">
          needs {String(rule.minScore)}+ · {formatBps(rule.maxLtvBps)} LTV · {formatBps(rule.aprBps)} APR
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono tnum">{formatAmount(maxBorrow(DEMO_COLLATERAL, tier))}</div>
        <div className="text-[10px] text-fg-dim uppercase tracking-wider">
          per {formatAmount(DEMO_COLLATERAL)} collateral
        </div>
      </div>
    </div>
  );
}

export function ScoreCard() {
  const { score, tier } = useDemo();
  const progress = tierProgress(score);

  return (
    <Panel
      title="Credit score"
      subtitle="Computed on this device from your attestations. The chain never sees it."
      tone="private"
      aside={<VisibilityTag tone="private" />}
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Your score" value={String(score)} tone="private" sub="visible only here" />
        <Stat
          label="What a lender learns"
          value={scoreBand(score)}
          tone="public"
          sub="the band, from your tier"
        />
      </div>

      {progress.next !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-fg-dim">Progress to tier {progress.next}</span>
            <span className="font-mono tnum text-fg-muted">
              {String(TIER_RULES[progress.next].minScore - score)} points to go
            </span>
          </div>
          <Meter value={progress.fraction} tone="public" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <TierRow tier={0} unlocked={tier !== null} />
        <TierRow tier={1} unlocked={tier === 1} />
      </div>

      <Row label="Highest tier unlocked" tone={tier === null ? "danger" : "private"}>
        {tier === null ? "none" : `tier ${tier}`}
      </Row>
    </Panel>
  );
}
