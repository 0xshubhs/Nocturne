"use client";

// Nocturne — link an external wallet (plan.md §4, §6).
//
// The flow is the real one: a challenge bound to the address and a nonce, an
// EIP-191 signature, secp256k1 recovery, a bounded score derived from the
// wallet's public history, and then the *oracle* mints the attestation. The
// borrower never mints their own cross-chain score — if they could, the tier
// gate would be decorative.

import { useState } from "react";
import { useDemo } from "@/lib/demo/use-demo";
import { historyFor } from "@/lib/demo/personas";
import { hasInjectedWallet } from "@/lib/demo/evm-signer";
import { crossChainBreakdown, MAX_CROSS_CHAIN_SCORE } from "@/lib/midnight/cross-chain";
import {
  Button,
  Empty,
  ErrorNote,
  Hash,
  Meter,
  Note,
  Panel,
  Pill,
  Row,
  VisibilityTag,
  shortAddress,
} from "./ui";

export function LinkExternalWallet() {
  const { persona, personaState, state, linkExternalWallet, unlinkWallet, busy } = useDemo();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"injected" | "demo-key" | null>(null);

  const history = historyFor(persona, state.ledger.blockTime);
  const linked = personaState.linkedWallets;
  const injectedAvailable = hasInjectedWallet();

  async function link(useInjected: boolean) {
    setLinking(true);
    setError(null);
    try {
      const result = await linkExternalWallet({ useInjected });
      setSource(result.source);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinking(false);
    }
  }

  return (
    <Panel
      title="Linked external wallets"
      subtitle="Prove you control a wallet on another chain and its public history becomes private credit."
      tone="private"
      aside={<VisibilityTag tone="private" />}
    >
      {linked.length === 0 ? (
        <Empty>
          {history
            ? `${persona.name} has an EVM wallet with a usable history. Linking it is the only way a thin file gets credit for a past.`
            : `${persona.name} has no external wallet in this demo — her institutional attestations already reach the top tier.`}
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {linked.map((w) => (
            <div key={w.address} className="rounded-xl border border-private/25 bg-private/[0.05] p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Pill tone="private">{w.chain}</Pill>
                  <code className="font-mono text-xs text-fg-muted" title={w.address}>
                    {shortAddress(w.address)}
                  </code>
                </div>
                <Button variant="ghost" onClick={() => unlinkWallet(w.address)} disabled={busy}>
                  Unlink
                </Button>
              </div>
              <Row label="Ownership proof" tone="private">
                verified · secp256k1
              </Row>
              <Row label="History commitment">
                <Hash value={w.commitment} chars={10} tone="private" />
              </Row>
              <Row label="Derived contribution" tone="private">
                +{String(w.derivedScore)} / {String(MAX_CROSS_CHAIN_SCORE)} max
              </Row>
              <Meter value={Number(w.derivedScore) / Number(MAX_CROSS_CHAIN_SCORE)} tone="private" />
              {source && (
                <p className="text-[11px] text-fg-dim">
                  {source === "injected"
                    ? "Signed by your browser wallet."
                    : "Signed by the built-in demo key — a real secp256k1 signature, verified through the same recovery path; only its custody is simulated."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {history && linked.length === 0 && (
        <>
          <div className="rounded-xl border border-border bg-bg-inset p-4 flex flex-col gap-2">
            <div className="text-[10px] uppercase tracking-wider text-fg-dim">
              What this wallet would contribute
            </div>
            {crossChainBreakdown(history, Number(state.ledger.blockTime)).map((row) => (
              <Row key={row.label} label={row.label} tone={row.points < 0 ? "danger" : "neutral"}>
                {row.points >= 0 ? `+${row.points}` : row.points}
              </Row>
            ))}
            <div className="border-t border-border pt-2 mt-1">
              <Row label="Capped contribution" tone="private">
                +{String(MAX_CROSS_CHAIN_SCORE)} max
              </Row>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="private" onClick={() => void link(false)} disabled={busy || linking}>
              {linking ? "Verifying signature…" : "Sign with demo key"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void link(true)}
              disabled={busy || linking || !injectedAvailable}
              title={injectedAvailable ? undefined : "No injected EVM wallet detected"}
            >
              {injectedAvailable ? "Sign with browser wallet" : "No browser wallet detected"}
            </Button>
          </div>
        </>
      )}

      {error && <ErrorNote onDismiss={() => setError(null)}>{error}</ErrorNote>}

      <Note>
        The signature proves control of the address and nothing else — it grants no spending
        authority, and it is bound to a nonce so it cannot be replayed. Only the derived number
        reaches an attestation; the address and the history stay on this device.
      </Note>
    </Panel>
  );
}
