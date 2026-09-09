"use client";

// Nocturne — the lender's side (plan.md §6).
//
// A lender sees the pool, the tier rules, and a list of loans keyed by
// pseudonym. Scores appear only as bands, and only because a tier implies one.
// There is no view here that would let a lender identify a borrower, because
// there is no such view in the ledger.

import { useState } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { totalOutstanding } from "@/lib/demo/engine";
import { formatBps, TIER_RULES, type TierId } from "@/lib/midnight/score";
import { ProofProgress } from "./ProofProgress";
import {
  Button,
  Empty,
  ErrorNote,
  Field,
  Hash,
  Note,
  NumberInput,
  Panel,
  Pill,
  Row,
  Stat,
  VisibilityTag,
  formatAmount,
  formatDate,
} from "./ui";

/** The band a tier implies — the only thing a tier discloses about a score. */
function bandForTier(tier: TierId): string {
  return tier === 1
    ? `${TIER_RULES[1].minScore}+`
    : `${TIER_RULES[0].minScore}–${TIER_RULES[1].minScore - 1n}`;
}

export function PoolView() {
  const { state, deposit, withdraw, liquidate, busy, progress, error, clearError } = useDemo();
  const [amount, setAmount] = useState("100000");

  const ledger = state.ledger;
  const loans = Object.entries(ledger.loans);
  const outstanding = totalOutstanding(ledger);
  const amountN = /^\d+$/.test(amount.trim()) ? BigInt(amount.trim()) : 0n;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        title="Pool"
        subtitle="Everything a lender can read. All of it public, none of it identifying."
        tone="public"
        aside={<VisibilityTag tone="public" />}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Liquidity" value={formatAmount(ledger.poolLiquidity)} tone="public" />
          <Stat label="Outstanding" value={formatAmount(outstanding)} tone="public" />
          <Stat label="Open loans" value={loans.length} tone="public" />
          <Stat label="Loans ever" value={ledger.loanCount} tone="public" sub="monotonic counter" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {([0, 1] as const).map((tier) => (
            <div key={tier} className="rounded-xl border border-border bg-bg-inset p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tier {tier}</span>
                <Pill tone="public">band {bandForTier(tier)}</Pill>
              </div>
              <Row label="Max LTV" tone="public">
                {formatBps(TIER_RULES[tier].maxLtvBps)}
              </Row>
              <Row label="APR" tone="public">
                {formatBps(TIER_RULES[tier].aprBps)}
              </Row>
              <Row label="Open at this tier" tone="public">
                {loans.filter(([, l]) => l.tier === tier).length}
              </Row>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Outstanding loans" subtitle="Keyed by nullifier. There is no column for who." tone="public">
        {loans.length === 0 ? (
          <Empty>No open loans.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm border-separate border-spacing-y-1.5">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-fg-dim text-left">
                  <th className="font-medium pb-1">Borrower</th>
                  <th className="font-medium pb-1">Tier</th>
                  <th className="font-medium pb-1">Score band</th>
                  <th className="font-medium pb-1 text-right">Principal</th>
                  <th className="font-medium pb-1 text-right">Collateral</th>
                  <th className="font-medium pb-1 text-right">Due</th>
                  <th className="font-medium pb-1 text-right" />
                </tr>
              </thead>
              <tbody>
                {loans.map(([nullifier, loan]) => {
                  const overdue = ledger.blockTime >= loan.dueTime;
                  return (
                    <tr key={nullifier} className="bg-bg-inset">
                      <td className="py-2.5 pl-3 rounded-l-lg">
                        <Hash value={nullifier} chars={10} />
                      </td>
                      <td className="py-2.5">
                        <Pill tone="public">{loan.tier}</Pill>
                      </td>
                      <td className="py-2.5 font-mono tnum text-xs text-fg-muted">
                        {bandForTier(loan.tier)}
                      </td>
                      <td className="py-2.5 text-right font-mono tnum text-public">
                        {formatAmount(loan.principal)}
                      </td>
                      <td className="py-2.5 text-right font-mono tnum text-public">
                        {formatAmount(loan.collateral)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs text-fg-dim">
                        {formatDate(loan.dueTime)}
                      </td>
                      <td className="py-2.5 pr-3 text-right rounded-r-lg">
                        {overdue ? (
                          <Button variant="danger" onClick={() => void liquidate(nullifier)} disabled={busy}>
                            Liquidate
                          </Button>
                        ) : (
                          <span className="text-xs text-fg-dim">in term</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ledger.defaulters.length > 0 && (
          <div className="rounded-xl border border-danger/30 bg-danger/[0.05] p-4 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider text-danger">
              Defaulters — the one place an identity is disclosed
            </div>
            {ledger.defaulters.map((n) => (
              <div key={n} className="flex items-center justify-between gap-3">
                <Hash value={n} chars={16} tone="danger" />
                <span className="text-xs text-fg-dim">nullifier only — no score, no history</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Provide liquidity" subtitle="Deposits and withdrawals are ordinary public calls.">
        <Field label="Amount">
          <NumberInput value={amount} onChange={setAmount} min={0} disabled={busy} suffix="tDUST" />
        </Field>
        <ProofProgress progress={progress} />
        {error && <ErrorNote onDismiss={clearError}>{error}</ErrorNote>}
        <div className="flex gap-2">
          <Button onClick={() => void deposit(amountN)} disabled={busy || amountN <= 0n}>
            Deposit
          </Button>
          <Button variant="ghost" onClick={() => void withdraw(amountN)} disabled={busy || amountN <= 0n}>
            Withdraw
          </Button>
        </div>
        <Note>
          A liquidated loan pays the pool its collateral. In this demo Bob&apos;s default leaves the
          pool larger than it started — the collateral exceeded what he took.
        </Note>
      </Panel>
    </div>
  );
}
