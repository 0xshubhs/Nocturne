"use client";

// defi1 — the borrower's attestation inbox (plan.md §6).
//
// The whole privacy argument in one component: the values are on screen because
// this device holds them. What reached the chain is the hash on the right, and
// nothing else. The two columns are deliberately side by side.

import { useDemo } from "@/lib/demo/use-demo";
import { attestationLeaf, subjectIdFor } from "@/lib/demo/engine";
import {
  ATTESTATION_FIELDS,
  FIELD_ISSUERS,
  FIELD_LABELS,
  scoreBreakdown,
  WEIGHT,
} from "@/lib/midnight/score";
import { Hash, Panel, Pill, VisibilityTag, formatDate } from "./ui";

export function AttestationInbox() {
  const { persona, personaState, state } = useDemo();
  const now = state.ledger.blockTime;
  const subject = subjectIdFor(persona.secret);
  const rows = scoreBreakdown(personaState.attestations, now);

  return (
    <Panel
      title="Attestation inbox"
      subtitle="Issued to you, held by you. The chain received only the commitment hash of each one."
      tone="private"
      aside={<VisibilityTag tone="private" />}
    >
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-fg-dim text-left">
              <th className="font-medium pb-1">Attestation</th>
              <th className="font-medium pb-1">Issuer</th>
              <th className="font-medium pb-1 text-right">Value</th>
              <th className="font-medium pb-1 text-right">Weight</th>
              <th className="font-medium pb-1 text-right">Points</th>
              <th className="font-medium pb-1 text-right">Expires</th>
              <th className="font-medium pb-1 text-right">On-chain leaf</th>
            </tr>
          </thead>
          <tbody>
            {ATTESTATION_FIELDS.map((field) => {
              const att = personaState.attestations[field];
              const row = rows.find((r) => r.field === field)!;
              const leaf = att ? attestationLeaf(field, att, subject) : null;
              const held = att !== undefined;

              return (
                <tr key={field} className="bg-bg-inset">
                  <td className="py-2.5 pl-3 rounded-l-lg">
                    <span className="text-fg">{FIELD_LABELS[field]}</span>
                  </td>
                  <td className="py-2.5 text-xs text-fg-dim">{FIELD_ISSUERS[field]}</td>
                  <td className="py-2.5 text-right font-mono tnum text-private">
                    {held ? String(att.value) : "—"}
                  </td>
                  <td className="py-2.5 text-right font-mono tnum text-fg-dim">×{String(WEIGHT[field])}</td>
                  <td className="py-2.5 text-right font-mono tnum">
                    {row.expired ? (
                      <Pill tone="danger">expired</Pill>
                    ) : (
                      <span className={row.points > 0n ? "text-fg" : "text-fg-dim"}>
                        {String(row.points)}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-xs text-fg-dim font-mono">
                    {held ? formatDate(att.expiry) : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right rounded-r-lg">
                    {leaf ? <Hash value={leaf} chars={8} /> : <span className="text-fg-dim text-xs">none</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-fg-dim leading-relaxed">
        The circuit proves each leaf is in the issuer&apos;s Merkle root and that it binds this
        subject to that exact value and expiry — without revealing the value, the expiry, or which
        leaf it is. A borrower cannot mint one: an attestation with no matching leaf has no path to
        prove.
      </p>
    </Panel>
  );
}
