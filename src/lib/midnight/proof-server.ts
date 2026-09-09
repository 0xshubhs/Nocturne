// Nocturne — proof server health + a small state machine for the "generate proof,
// submit, wait" flow. Proof generation on Midnight is slow (seconds to minutes),
// so every borrow / repay path drives one of these and renders the phase.

export type ProofServerHealth = {
  ok: boolean;
  url: string;
  latencyMs?: number;
  detail: string;
};

/**
 * The proof server has no dedicated health endpoint; any HTTP response back
 * (even a 404) means the process is up and reachable.
 */
export async function checkProofServerHealth(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<ProofServerHealth> {
  const timeoutMs = opts.timeoutMs ?? 4000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    const latencyMs = Math.round(performance.now() - started);
    return {
      ok: true,
      url,
      latencyMs,
      detail: `reachable (HTTP ${res.status}) in ${latencyMs}ms`,
    };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? `no response in ${timeoutMs}ms` : String(err);
    return { ok: false, url, detail: `unreachable — ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

export type ProofPhase =
  | "idle"
  | "building"
  | "proving"
  | "balancing"
  | "submitting"
  | "confirming"
  | "done"
  | "error";

export type ProofProgress = {
  phase: ProofPhase;
  message?: string;
  txId?: string;
  error?: string;
};

export const PHASE_LABELS: Record<ProofPhase, string> = {
  idle: "Ready",
  building: "Building transaction",
  proving: "Generating zero-knowledge proof (this can take a while)",
  balancing: "Paying DUST fees",
  submitting: "Submitting to the network",
  confirming: "Waiting for confirmation",
  done: "Done",
  error: "Failed",
};

/** Run an async step sequence, reporting each phase to `onProgress`. */
export async function runWithProgress<T>(
  steps: Array<{ phase: ProofPhase; run: () => Promise<Partial<ProofProgress> | void> }>,
  onProgress: (p: ProofProgress) => void,
): Promise<T | undefined> {
  let last: ProofProgress = { phase: "idle" };
  try {
    for (const step of steps) {
      last = { ...last, phase: step.phase, message: PHASE_LABELS[step.phase] };
      onProgress(last);
      const patch = await step.run();
      if (patch) last = { ...last, ...patch };
    }
    last = { ...last, phase: "done", message: PHASE_LABELS.done };
    onProgress(last);
    return undefined;
  } catch (err) {
    onProgress({ ...last, phase: "error", error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
