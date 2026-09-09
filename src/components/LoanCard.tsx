"use client";

// defi1 — the active loan (plan.md §6).
//
// Everything on this card is public: it is exactly the `LoanRecord` the ledger
// holds, keyed by a nullifier. That is the point — the borrower can see that
// what the chain knows about their loan is only ever these five fields.

import { useState } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { liquidationRisk } from "@/lib/demo/engine";
import { formatBps, interestDue, TIER_RULES } from "@/lib/midnight/score";
import { ProofProgress } from "./ProofProgress";
import {
  Button,
  ErrorNote,
  Empty,
  Hash,
  Meter,
  Note,
  Panel,
  Pill,
  Row,
  VisibilityTag,
  formatAmount,
  formatDate,
  formatDuration,
} from "./ui";

export function LoanCard() {
  const { loan, nullifier, personaState, state, repay, busy, progress, error, clearError } = useDemo();
  const [repaying, setRepaying] = useState(false);

  if (!loan) {
    return (
      <Panel title="Active loan" aside={<VisibilityTag tone="public" />}>
        <Empty>No open loan. One active loan per identity — the nullifier enforces it.</Empty>
      </Panel>
    );
  }

  const rule = TIER_RULES[loan.tier];
  const now = state.ledger.blockTime;
  const openedAt = personaState.loanOpenedAt ?? now;
  const risk = liquidationRisk(state.ledger, loan, openedAt);
  const overdue = now >= loan.dueTime;
  const remaining = overdue ? 0n : loan.dueTime - now;
  const elapsed = now - openedAt;
  const interest = interestDue(loan.principal, rule.aprBps, elapsed > 0n ? elapsed : 0n);
  const payoff = loan.principal + interest;

  async function doRepay() {
    setRepaying(true);
    clearError();
    try {
      await repay(payoff);
    } catch {
      /* surfaced through `error` */
    } finally {
      setRepaying(false);
    }
  }

  return (
    <Panel
      title="Active loan"
      subtitle="The complete on-chain record. Five fields and a pseudonym."
      tone={overdue ? "danger" : "public"}
      aside={<VisibilityTag tone="public" />}
    >
      <div className="flex items-center justify-between gap-3">
        <Hash value={nullifier} chars={12} />
        {overdue ? <Pill tone="danger">in default</Pill> : <Pill tone="public">tier {loan.tier}</Pill>}
      </div>

      <div className="rounded-xl border border-border bg-bg-inset p-4 flex flex-col gap-2">
        <Row label="Principal" tone="public">
          {formatAmount(loan.principal)}
        </Row>
        <Row label="Collateral" tone="public">
          {formatAmount(loan.collateral)}
        </Row>
        <Row label="APR" tone="public">
          {formatBps(rule.aprBps)}
        </Row>
        <Row label="Interest accrued" tone="public">
          {formatAmount(interest)}
        </Row>
        <Row label="Due" tone="public">
          {formatDate(loan.dueTime)}
        </Row>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-fg-dim">Liquidation risk</span>
          <span className={`font-mono tnum ${overdue ? "text-danger" : "text-fg-muted"}`}>
            {overdue ? "liquidatable now" : `${formatDuration(remaining)} left`}
          </span>
        </div>
        <Meter value={risk} tone={overdue ? "danger" : risk > 0.75 ? "public" : "private"} />
      </div>

      <ProofProgress progress={progress} />
      {error && <ErrorNote onDismiss={clearError}>{error}</ErrorNote>}

      <Button onClick={() => void doRepay()} disabled={busy || repaying} full>
        {repaying ? "Proving…" : `Repay ${formatAmount(payoff)}`}
      </Button>

      <Note>
        Repaying clears the loan and frees the nullifier. Nothing links the closed loan back to you —
        the counter records that <em>a</em> loan happened, not whose.
      </Note>
    </Panel>
  );
}
