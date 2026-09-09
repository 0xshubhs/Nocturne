"use client";

// Nocturne — demo mode state.
//
// Holds one `DemoLedger` (what the chain would see) plus each persona's local
// private state (what only they can see), and exposes the circuit calls as
// actions that run through the same `runWithProgress` phase machine the real
// submit pipeline uses. Proving on Midnight is slow, so the phases are paced —
// the wait is the honest part of the UX, not a flourish.
//
// Nothing here talks to a network. `lib/midnight/*` is the real path; this is
// the one you can run on a laptop with no node.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  demo,
  emptyLedger,
  loanFor,
  nullifierFor,
  type DemoLedger,
  type DemoLoan,
} from "./engine";
import {
  DEFAULT_TERM_SECONDS,
  historyFor,
  initialAttestations,
  PERSONAS,
  PERSONA_IDS,
  SEED_LIQUIDITY,
  type PersonaId,
} from "./personas";
import { demoPersonalSign, hasInjectedWallet, signWithInjectedWallet } from "./evm-signer";
import { runLinkFlow } from "./link-flow";
import {
  MAX_CROSS_CHAIN_SCORE,
  type ExternalHistory,
  type LinkedWallet,
} from "@/lib/midnight/cross-chain";
import { runWithProgress, type ProofProgress } from "@/lib/midnight/proof-server";
import { scoreFromSet, tierFor, type AttestationSet, type TierId } from "@/lib/midnight/score";

/** Fixed start time so the demo reads the same on every machine. */
const DEMO_START = 1_700_000_000n;

/** How long each simulated phase takes. Proving is deliberately the slow one. */
const PHASE_MS = { building: 120, proving: 900, balancing: 200, submitting: 200, confirming: 300 };

export type PersonaState = {
  attestations: AttestationSet;
  linkedWallets: LinkedWallet[];
  /** Block time the current loan was opened at, for the risk meter. */
  loanOpenedAt: bigint | null;
};

export type DemoState = {
  ledger: DemoLedger;
  active: PersonaId;
  personas: Record<PersonaId, PersonaState>;
};

function initialState(): DemoState {
  let ledger = emptyLedger(DEMO_START);
  ledger = demo.depositLiquidity(ledger, SEED_LIQUIDITY);

  const personas = {} as Record<PersonaId, PersonaState>;
  for (const id of PERSONA_IDS) {
    const attestations = initialAttestations(PERSONAS[id], DEMO_START);
    ledger = demo.issueSet(ledger, PERSONAS[id].secret, attestations);
    personas[id] = { attestations, linkedWallets: [], loanOpenedAt: null };
  }

  return { ledger, active: "alice", personas };
}

type Action =
  | { type: "ledger"; ledger: DemoLedger }
  | { type: "active"; id: PersonaId }
  | { type: "persona"; id: PersonaId; patch: Partial<PersonaState> }
  | { type: "reset" };

function reducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case "ledger":
      return { ...state, ledger: action.ledger };
    case "active":
      return { ...state, active: action.id };
    case "persona":
      return {
        ...state,
        personas: {
          ...state.personas,
          [action.id]: { ...state.personas[action.id], ...action.patch },
        },
      };
    case "reset":
      return initialState();
  }
}

export type LinkResult = LinkedWallet & { source: "injected" | "demo-key" };

type DemoContextValue = {
  state: DemoState;
  /** The persona whose private state the borrower view is showing. */
  persona: (typeof PERSONAS)[PersonaId];
  personaState: PersonaState;
  score: bigint;
  tier: TierId | null;
  loan: DemoLoan | null;
  nullifier: string;
  progress: ProofProgress;
  busy: boolean;
  error: string | null;

  setActive: (id: PersonaId) => void;
  borrow: (args: { tier: TierId; amount: bigint; collateral: bigint; termSeconds: bigint }) => Promise<void>;
  repay: (amount: bigint) => Promise<void>;
  liquidate: (nullifier: string) => Promise<void>;
  deposit: (amount: bigint) => Promise<void>;
  withdraw: (amount: bigint) => Promise<void>;
  advanceTime: (seconds: bigint) => void;
  linkExternalWallet: (opts?: { useInjected?: boolean }) => Promise<LinkResult>;
  unlinkWallet: (address: string) => void;
  reset: () => void;
  clearError: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [progress, setProgress] = useState<ProofProgress>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Actions read the ledger through a ref so a sequence of awaits always sees
  // the latest state rather than the one captured when the click happened.
  // `setLedger` keeps it current within an action; this effect re-syncs it
  // after any state change that did not go through `setLedger` (reset, and the
  // initial mount). Writing a ref during render is not allowed.
  const ledgerRef = useRef(state.ledger);
  useEffect(() => {
    ledgerRef.current = state.ledger;
  }, [state.ledger]);

  const setLedger = useCallback((ledger: DemoLedger) => {
    ledgerRef.current = ledger;
    dispatch({ type: "ledger", ledger });
  }, []);

  /**
   * Run one ledger transition through the phase machine. The transition itself
   * is applied at the "submitting" step, so a rejected call fails where a real
   * one would — after the proof, at the point the chain checks the asserts.
   */
  const runCall = useCallback(
    async (apply: (ledger: DemoLedger) => DemoLedger) => {
      setBusy(true);
      setError(null);
      try {
        await runWithProgress(
          [
            { phase: "building", run: () => wait(PHASE_MS.building) },
            { phase: "proving", run: () => wait(PHASE_MS.proving) },
            { phase: "balancing", run: () => wait(PHASE_MS.balancing) },
            {
              phase: "submitting",
              run: async () => {
                await wait(PHASE_MS.submitting);
                setLedger(apply(ledgerRef.current));
              },
            },
            { phase: "confirming", run: () => wait(PHASE_MS.confirming) },
          ],
          setProgress,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [setLedger],
  );

  const active = state.active;
  const personaState = state.personas[active];
  const persona = PERSONAS[active];

  const borrow = useCallback<DemoContextValue["borrow"]>(
    async ({ tier, amount, collateral, termSeconds }) => {
      const dueTime = ledgerRef.current.blockTime + termSeconds;
      const openedAt = ledgerRef.current.blockTime;
      await runCall((ledger) =>
        demo.borrow(ledger, {
          secret: persona.secret,
          attestations: personaState.attestations,
          tier,
          amount,
          collateral,
          dueTime,
        }),
      );
      dispatch({ type: "persona", id: active, patch: { loanOpenedAt: openedAt } });
    },
    [active, persona.secret, personaState.attestations, runCall],
  );

  const repay = useCallback(
    async (amount: bigint) => {
      await runCall((ledger) => demo.repay(ledger, persona.secret, amount));
      dispatch({ type: "persona", id: active, patch: { loanOpenedAt: null } });
    },
    [active, persona.secret, runCall],
  );

  const liquidate = useCallback(
    async (nullifier: string) => {
      await runCall((ledger) => demo.liquidate(ledger, nullifier));
    },
    [runCall],
  );

  const deposit = useCallback(
    async (amount: bigint) => runCall((ledger) => demo.depositLiquidity(ledger, amount)),
    [runCall],
  );

  const withdraw = useCallback(
    async (amount: bigint) => runCall((ledger) => demo.withdrawLiquidity(ledger, amount)),
    [runCall],
  );

  const advanceTime = useCallback(
    (seconds: bigint) => setLedger(demo.advanceTime(ledgerRef.current, seconds)),
    [setLedger],
  );

  /**
   * The §4 flow, for real: challenge -> signature -> secp256k1 recovery ->
   * bounded score -> the *issuer* mints the `crossChain` attestation. The
   * borrower never mints their own score; if they could, the tier gate would
   * mean nothing.
   */
  const linkExternalWallet = useCallback<DemoContextValue["linkExternalWallet"]>(
    async (opts) => {
      setError(null);
      const blockTime = ledgerRef.current.blockTime;
      const history = historyFor(persona, blockTime);
      if (!history) throw new Error(`${persona.name} has no external wallet in this demo`);

      try {
        const { linked, attestation, source } = await runLinkFlow({
          history,
          now: Number(blockTime),
          expiry: blockTime + BigInt(365 * 24 * 3600),
          sign: async (challenge, buildMessage) => {
            if (opts?.useInjected && hasInjectedWallet()) {
              const signed = await signWithInjectedWallet(challenge.message, buildMessage);
              return { ...signed, source: "injected" as const };
            }
            return {
              address: challenge.address,
              signature: demoPersonalSign(challenge.message),
              source: "demo-key" as const,
            };
          },
        });

        // Only now does the oracle publish the leaf — and only then does the
        // borrower's score move.
        setLedger(demo.issueSet(ledgerRef.current, persona.secret, { crossChain: attestation }));
        dispatch({
          type: "persona",
          id: active,
          patch: {
            attestations: { ...personaState.attestations, crossChain: attestation },
            linkedWallets: [
              ...personaState.linkedWallets.filter(
                (w) => w.address.toLowerCase() !== linked.address.toLowerCase(),
              ),
              linked,
            ],
          },
        });

        return { ...linked, source };
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [active, persona, personaState.attestations, personaState.linkedWallets, setLedger],
  );

  const unlinkWallet = useCallback(
    (address: string) => {
      const remaining = personaState.linkedWallets.filter(
        (w) => w.address.toLowerCase() !== address.toLowerCase(),
      );
      // Dropping the link does not retract the attestation the oracle already
      // published — it stays in the historic tree until it expires. What
      // changes is that this client stops using it.
      dispatch({
        type: "persona",
        id: active,
        patch: {
          linkedWallets: remaining,
          attestations: {
            ...personaState.attestations,
            crossChain: { value: 0n, expiry: personaState.attestations.crossChain?.expiry ?? 0n },
          },
        },
      });
    },
    [active, personaState.attestations, personaState.linkedWallets],
  );

  const value = useMemo<DemoContextValue>(() => {
    const score = scoreFromSet(personaState.attestations, state.ledger.blockTime);
    return {
      state,
      persona,
      personaState,
      score,
      tier: tierFor(score),
      loan: loanFor(state.ledger, persona.secret),
      nullifier: nullifierFor(persona.secret),
      progress,
      busy,
      error,
      setActive: (id) => dispatch({ type: "active", id }),
      borrow,
      repay,
      liquidate,
      deposit,
      withdraw,
      advanceTime,
      linkExternalWallet,
      unlinkWallet,
      reset: () => {
        dispatch({ type: "reset" });
        setProgress({ phase: "idle" });
        setError(null);
      },
      clearError: () => setError(null),
    };
  }, [
    state,
    persona,
    personaState,
    progress,
    busy,
    error,
    borrow,
    repay,
    liquidate,
    deposit,
    withdraw,
    advanceTime,
    linkExternalWallet,
    unlinkWallet,
  ]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside <DemoProvider>");
  return ctx;
}

export { DEFAULT_TERM_SECONDS, MAX_CROSS_CHAIN_SCORE };
export type { ExternalHistory };
