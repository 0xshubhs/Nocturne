"use client";

// defi1 — "what the chain sees" against "what you know" (plan.md §6).
//
// The demo's whole argument, in two columns. The left is the serialized ledger:
// literally everything an observer, an indexer, or a competing lender can read.
// The right is this device's private state. Nothing crosses between them except
// the hashes, and a hash of a value you do not know is not a value.

import { useState } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { attestationLeaf, nullifierFor, subjectIdFor } from "@/lib/demo/engine";
import { PERSONAS, PERSONA_IDS } from "@/lib/demo/personas";
import { ATTESTATION_FIELDS, FIELD_LABELS, scoreFromSet } from "@/lib/midnight/score";
import { Hash, Panel, Pill, Redacted, VisibilityTag, formatAmount, formatDate, shortAddress } from "./ui";

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono tnum text-xs">{children}</span>;
}

function Line({
  k,
  children,
  indent = 0,
}: {
  k: string;
  children: React.ReactNode;
  indent?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5" style={{ paddingLeft: indent * 12 }}>
      <span className="text-xs text-fg-dim shrink-0">{k}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  );
}

export function ExplorerPanel() {
  const { state } = useDemo();
  const [inspecting, setInspecting] = useState(state.active);

  const ledger = state.ledger;
  const persona = PERSONAS[inspecting];
  const personaState = state.personas[inspecting];
  const subject = subjectIdFor(persona.secret);
  const nullifier = nullifierFor(persona.secret);
  const loan = ledger.loans[nullifier];
  const score = scoreFromSet(personaState.attestations, ledger.blockTime);

  return (
    <Panel
      title="Explorer"
      subtitle="Side by side: the public ledger, and what this device knows. Nothing on the left implies anything on the right."
      aside={
        <div className="flex gap-1">
          {PERSONA_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setInspecting(id)}
              className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
                inspecting === id ? "bg-white/10 text-fg" : "text-fg-dim hover:text-fg-muted"
              }`}
            >
              {PERSONAS[id].name}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid lg:grid-cols-2 gap-4">
        {/* ------------------------------ chain ------------------------------ */}
        <div className="rounded-xl border border-public/25 bg-public/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-public/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-public">What the chain sees</span>
            <VisibilityTag tone="public" />
          </div>
          <div className="p-4 flex flex-col gap-0.5">
            <Line k="blockTime">
              <Mono>{formatDate(ledger.blockTime)}</Mono>
            </Line>
            <Line k="poolLiquidity">
              <Mono>{formatAmount(ledger.poolLiquidity)}</Mono>
            </Line>
            <Line k="loanCount">
              <Mono>{ledger.loanCount}</Mono>
            </Line>

            <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
              attestationRoot — {ledger.attestationLeaves.length} leaves
            </div>
            <div className="rounded-lg bg-black/40 p-2.5 flex flex-col gap-1 max-h-32 overflow-y-auto">
              {ledger.attestationLeaves.map((leaf) => (
                <Hash key={leaf} value={leaf} chars={20} />
              ))}
            </div>

            <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
              this borrower&apos;s loan
            </div>
            {loan ? (
              <>
                <Line k="key (nullifier)">
                  <Hash value={nullifier} chars={12} />
                </Line>
                <Line k="tier" indent={1}>
                  <Mono>{loan.tier}</Mono>
                </Line>
                <Line k="principal" indent={1}>
                  <Mono>{formatAmount(loan.principal)}</Mono>
                </Line>
                <Line k="collateral" indent={1}>
                  <Mono>{formatAmount(loan.collateral)}</Mono>
                </Line>
                <Line k="dueTime" indent={1}>
                  <Mono>{formatDate(loan.dueTime)}</Mono>
                </Line>
              </>
            ) : (
              <p className="text-xs text-fg-dim">no open loan under this nullifier</p>
            )}

            <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-fg-dim">defaulters</div>
            {ledger.defaulters.length === 0 ? (
              <p className="text-xs text-fg-dim">empty</p>
            ) : (
              ledger.defaulters.map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <Hash value={n} chars={14} tone="danger" />
                  {n === nullifier && <Pill tone="danger">this borrower</Pill>}
                </div>
              ))
            )}

            <div className="mt-4 pt-3 border-t border-public/15 flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wider text-fg-dim">not in the ledger</div>
              <Line k="identity">
                <Redacted>no field exists</Redacted>
              </Line>
              <Line k="creditScore">
                <Redacted>no field exists</Redacted>
              </Line>
              <Line k="attestationValues">
                <Redacted>only hashes</Redacted>
              </Line>
              <Line k="linkedWallets">
                <Redacted>never submitted</Redacted>
              </Line>
            </div>
          </div>
        </div>

        {/* ------------------------------ device ----------------------------- */}
        <div className="rounded-xl border border-private/25 bg-private/[0.03] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-private/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-private">What {persona.name} knows</span>
            <VisibilityTag tone="private" />
          </div>
          <div className="p-4 flex flex-col gap-0.5">
            <Line k="identity">
              <Mono>{persona.name}</Mono>
            </Line>
            <Line k="callerSecret">
              <Mono>
                <span className="text-private">32 bytes, never transmitted</span>
              </Mono>
            </Line>
            <Line k="subjectId">
              <Hash value={subject} chars={12} tone="private" />
            </Line>
            <Line k="nullifier">
              <Hash value={nullifier} chars={12} tone="private" />
            </Line>
            <Line k="creditScore">
              <Mono>
                <span className="text-private">{String(score)}</span>
              </Mono>
            </Line>

            <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
              attestations, in the clear
            </div>
            {ATTESTATION_FIELDS.map((field) => {
              const att = personaState.attestations[field];
              return (
                <Line key={field} k={FIELD_LABELS[field]} indent={1}>
                  {att ? (
                    <Mono>
                      <span className="text-private">{String(att.value)}</span>
                      <span className="text-fg-dim"> · exp {formatDate(att.expiry)}</span>
                    </Mono>
                  ) : (
                    <span className="text-xs text-fg-dim">none</span>
                  )}
                </Line>
              );
            })}

            <div className="mt-3 mb-1 text-[10px] uppercase tracking-wider text-fg-dim">
              linked external wallets
            </div>
            {personaState.linkedWallets.length === 0 ? (
              <p className="text-xs text-fg-dim">none linked</p>
            ) : (
              personaState.linkedWallets.map((w) => (
                <div key={w.address} className="flex flex-col gap-0.5">
                  <Line k={w.chain} indent={1}>
                    <Mono>
                      <span className="text-private">{shortAddress(w.address)}</span>
                    </Mono>
                  </Line>
                  <Line k="commitment" indent={2}>
                    <Hash value={w.commitment} chars={12} tone="private" />
                  </Line>
                  <Line k="contribution" indent={2}>
                    <Mono>
                      <span className="text-private">+{String(w.derivedScore)}</span>
                    </Mono>
                  </Line>
                </div>
              ))
            )}

            <div className="mt-4 pt-3 border-t border-private/15">
              <div className="text-[10px] uppercase tracking-wider text-fg-dim mb-1">
                the bridge between the columns
              </div>
              <p className="text-xs text-fg-dim leading-relaxed">
                Each value on the right hashes to a leaf on the left. Going that way is one line of
                code; coming back is the whole problem. The proof asserts the leaf exists and binds
                these values — without naming the leaf or the values.
              </p>
              {personaState.attestations.bank && (
                <div className="mt-2 rounded-lg bg-black/40 p-2.5 flex flex-col gap-1">
                  <div className="text-[10px] text-fg-dim">
                    bank = {String(personaState.attestations.bank.value)} ↦
                  </div>
                  <Hash
                    value={attestationLeaf("bank", personaState.attestations.bank, subject)}
                    chars={24}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
