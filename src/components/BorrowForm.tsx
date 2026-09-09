"use client";

// Nocturne — the borrow form (plan.md §6).
//
// Every constraint is checked here before the button enables, and then checked
// again by the circuit. The client-side copy exists to explain *why* something
// is not allowed; the circuit's copy is the one that matters.

import { useMemo, useState } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { DEFAULT_TERM_SECONDS, DEMO_COLLATERAL } from "@/lib/demo/personas";
import {
  formatBps,
  interestDue,
  maxBorrow,
  MAX_LOAN_TERM_SECONDS,
  TIER_RULES,
  withinLtv,
  type TierId,
} from "@/lib/midnight/score";
import { ProofProgress } from "./ProofProgress";
import {
  Button,
  ErrorNote,
  Field,
  Meter,
  Note,
  NumberInput,
  Panel,
  Row,
  Segmented,
  VisibilityTag,
  formatAmount,
  formatDate,
} from "./ui";

const TERM_OPTIONS = [7, 30, 90] as const;

export function BorrowForm() {
  const { tier, loan, borrow, busy, progress, state, error, clearError } = useDemo();

  // Defaults follow the borrower: their best tier, and the most it allows
  // against the demo collateral. `BorrowerDashboard` keys this component on the
  // persona, so switching borrowers re-derives them rather than carrying the
  // previous borrower's tier over — which would silently under-borrow.
  const defaultTier: TierId = tier ?? 0;
  const [amount, setAmount] = useState(() => String(maxBorrow(DEMO_COLLATERAL, defaultTier)));
  const [collateral, setCollateral] = useState(String(DEMO_COLLATERAL));
  const [termDays, setTermDays] = useState<number>(Number(DEFAULT_TERM_SECONDS / 86400n));
  const [selectedTier, setSelectedTier] = useState<TierId>(defaultTier);

  const amountN = safeBigint(amount);
  const collateralN = safeBigint(collateral);
  const termSeconds = BigInt(termDays) * 86400n;
  const rule = TIER_RULES[selectedTier];

  const cap = collateralN > 0n ? maxBorrow(collateralN, selectedTier) : 0n;
  const utilisation = cap > 0n ? Number((amountN * 1000n) / cap) / 1000 : 0;

  const problem = useMemo(() => {
    if (loan) return "You already have an active loan — one per identity.";
    if (tier === null) return "Your score does not clear tier 0. Link a wallet or wait for an attestation.";
    if (selectedTier > tier) return `Your score does not clear tier ${selectedTier}.`;
    if (amountN <= 0n) return "Enter an amount.";
    if (collateralN <= 0n) return "Enter your collateral.";
    if (!withinLtv(amountN, collateralN, selectedTier))
      return `Over the tier-${selectedTier} cap of ${formatBps(rule.maxLtvBps)} — the most you can take against ${formatAmount(collateralN)} is ${formatAmount(cap)}.`;
    if (amountN > state.ledger.poolLiquidity) return "The pool does not hold that much.";
    if (termSeconds > MAX_LOAN_TERM_SECONDS) return "Term is longer than the 90-day cap.";
    return null;
  }, [loan, tier, selectedTier, amountN, collateralN, rule.maxLtvBps, cap, state.ledger.poolLiquidity, termSeconds]);

  async function submit() {
    clearError();
    try {
      await borrow({ tier: selectedTier, amount: amountN, collateral: collateralN, termSeconds });
    } catch {
      /* surfaced through `error` */
    }
  }

  return (
    <Panel
      title="Borrow"
      subtitle="The proof asserts one bit about your score: that it clears the tier. Not the score itself."
      aside={<VisibilityTag tone="public" />}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Collateral you post" hint="Public — the chain records it.">
          <NumberInput value={collateral} onChange={setCollateral} min={0} disabled={busy} suffix="tDUST" />
        </Field>
        <Field
          label="Amount to borrow"
          hint={cap > 0n ? `Tier ${selectedTier} allows up to ${formatAmount(cap)}.` : undefined}
        >
          <NumberInput value={amount} onChange={setAmount} min={0} disabled={busy} suffix="tDUST" />
        </Field>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Tier">
          <Segmented
            value={selectedTier}
            onChange={setSelectedTier}
            disabled={busy}
            options={[
              {
                value: 0 as TierId,
                label: `Tier 0 · ${formatBps(TIER_RULES[0].maxLtvBps)}`,
                disabled: tier === null,
                title: tier === null ? "Score below tier 0" : undefined,
              },
              {
                value: 1 as TierId,
                label: `Tier 1 · ${formatBps(TIER_RULES[1].maxLtvBps)}`,
                disabled: tier !== 1,
                title: tier !== 1 ? "Score below tier 1" : undefined,
              },
            ]}
          />
        </Field>
        <Field label="Term">
          <Segmented
            value={String(termDays)}
            onChange={(v) => setTermDays(Number(v))}
            disabled={busy}
            options={TERM_OPTIONS.map((d) => ({ value: String(d), label: `${d}d` }))}
          />
        </Field>
      </div>

      {cap > 0n && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-fg-dim">LTV used</span>
            <span className="font-mono tnum text-fg-muted">
              {formatAmount(amountN)} / {formatAmount(cap)}
            </span>
          </div>
          <Meter value={utilisation} tone={utilisation > 1 ? "danger" : utilisation > 0.9 ? "public" : "private"} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg-inset p-4 flex flex-col gap-2">
        <Row label="APR" tone="public">
          {formatBps(rule.aprBps)}
        </Row>
        <Row label={`Interest over ${termDays} days`} tone="public">
          {formatAmount(interestDue(amountN, rule.aprBps, termSeconds))}
        </Row>
        <Row label="Due" tone="public">
          {formatDate(state.ledger.blockTime + termSeconds)}
        </Row>
        <Row label="Pool liquidity" tone="public">
          {formatAmount(state.ledger.poolLiquidity)}
        </Row>
      </div>

      <ProofProgress progress={progress} />

      {error && <ErrorNote onDismiss={clearError}>{error}</ErrorNote>}

      <div className="flex items-center gap-3">
        <Button onClick={() => void submit()} disabled={busy || problem !== null} full>
          {busy ? "Proving…" : "Generate proof and borrow"}
        </Button>
      </div>

      {problem && <p className="text-xs text-fg-dim">{problem}</p>}

      <Note>
        What lands on-chain: a nullifier, the tier, the amount, the collateral and the due date.
        What does not: who you are, your score, your attestation values, or the wallets you linked.
      </Note>
    </Panel>
  );
}

function safeBigint(v: string): bigint {
  const trimmed = v.trim();
  if (!/^\d+$/.test(trimmed)) return 0n;
  try {
    return BigInt(trimmed);
  } catch {
    return 0n;
  }
}
