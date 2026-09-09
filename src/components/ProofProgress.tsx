"use client";

// defi1 — the proof lifecycle, rendered.
//
// Proving on Midnight is genuinely slow (seconds to minutes for a real
// circuit). Hiding that behind a spinner would misrepresent what the chain is
// doing, so every phase is named and the slow one says so.

import { PHASE_LABELS, type ProofPhase, type ProofProgress as Progress } from "@/lib/midnight/proof-server";

const SEQUENCE: ProofPhase[] = ["building", "proving", "balancing", "submitting", "confirming"];

const SHORT: Record<ProofPhase, string> = {
  idle: "Ready",
  building: "Build",
  proving: "Prove",
  balancing: "Fees",
  submitting: "Submit",
  confirming: "Confirm",
  done: "Done",
  error: "Failed",
};

export function ProofProgress({ progress }: { progress: Progress }) {
  const { phase } = progress;
  if (phase === "idle") return null;

  const activeIndex = SEQUENCE.indexOf(phase);
  const failed = phase === "error";
  const done = phase === "done";

  return (
    <div className="rounded-xl border border-border bg-bg-inset p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {SEQUENCE.map((step, i) => {
          const state = failed
            ? i < activeIndex || activeIndex === -1
              ? "done"
              : i === activeIndex
                ? "failed"
                : "pending"
            : done || i < activeIndex
              ? "done"
              : i === activeIndex
                ? "active"
                : "pending";

          return (
            <div key={step} className="flex-1 flex flex-col gap-1.5">
              <div className="h-1 rounded-full overflow-hidden bg-white/[0.07] relative">
                {state === "done" && <div className="h-full w-full bg-private" />}
                {state === "active" && (
                  <>
                    <div className="h-full w-full bg-public/30" />
                    <div className="absolute inset-y-0 left-0 w-1/3 bg-public animate-sweep" />
                  </>
                )}
                {state === "failed" && <div className="h-full w-full bg-danger" />}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  state === "active"
                    ? "text-public"
                    : state === "done"
                      ? "text-private/70"
                      : state === "failed"
                        ? "text-danger"
                        : "text-fg-dim"
                }`}
              >
                {SHORT[step]}
              </span>
            </div>
          );
        })}
      </div>

      {failed ? (
        <p className="text-sm text-danger">
          <span className="font-medium">Rejected:</span> {progress.error}
        </p>
      ) : done ? (
        <p className="text-sm text-private">Confirmed on-chain.</p>
      ) : (
        <p className="text-sm text-fg-muted flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-public animate-pulse-ring" />
          {PHASE_LABELS[phase]}
        </p>
      )}
    </div>
  );
}
