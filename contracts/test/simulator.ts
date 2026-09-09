// defi1 — in-memory contract simulator for tests.
//
// Runs the generated circuit logic (no proof server, no ZK proving) against a
// local ledger state, rebuilding the circuit context from the latest state
// before every call so the simulated block time can advance between calls.
// The contract performs no Zswap coin operations, so there is no shielded-coin
// local state to thread. Cross-checked against compact-runtime 0.19.

import * as rt from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
} from "../src/managed/lending/contract/index.js";
import {
  attestationLeaf,
  emptyPrivateState,
  FIELD_TAG,
  witnesses,
  type Attestation,
  type DefiPrivateState,
} from "../src/witnesses.js";

const COIN_PK = "00".repeat(32);

export class LendingSim {
  private readonly contract: Contract<DefiPrivateState>;
  private readonly addr: string;
  private readonly zswap: unknown;
  private state: unknown;
  private time = 1_000_000;

  private constructor(contract: Contract<DefiPrivateState>, addr: string, zswap: unknown, state: unknown) {
    this.contract = contract;
    this.addr = addr;
    this.zswap = zswap;
    this.state = state;
  }

  static async deploy(issuerSecret: Uint8Array): Promise<LendingSim> {
    const contract = new Contract<DefiPrivateState>(witnesses);
    const init = await contract.initialState(
      rt.createConstructorContext(emptyPrivateState(issuerSecret), COIN_PK),
      issuerSecret,
    );
    return new LendingSim(
      contract,
      rt.sampleContractAddress(),
      init.currentZswapLocalState,
      (init.currentContractState as { data: unknown }).data,
    );
  }

  get ledger(): Ledger {
    return ledger(this.state as never) as Ledger;
  }

  setTime(seconds: number | bigint) {
    this.time = Number(seconds);
  }

  private async call<T>(
    ps: DefiPrivateState,
    fn: (ctx: rt.CircuitContext<DefiPrivateState>) => Promise<{ context: rt.CircuitContext<DefiPrivateState>; result: T }>,
  ): Promise<T> {
    const ctx = rt.createCircuitContext<DefiPrivateState>(
      "sim",
      this.addr,
      this.zswap as never,
      this.state as never,
      ps,
      undefined,
      undefined,
      undefined,
      this.time,
    );
    const res = await fn(ctx);
    this.state = (res.context.callContext.currentQueryContext as { state: unknown }).state;
    return res.result;
  }

  // --- helpers ---------------------------------------------------------

  subjectId(secret: Uint8Array): Uint8Array {
    return pureCircuits.makeSubjectId(secret);
  }

  nullifier(secret: Uint8Array): Uint8Array {
    return pureCircuits.makeNullifier(secret);
  }

  /** Issue the three attestations a borrower needs, as the issuer. */
  async issueFor(
    issuerSecret: Uint8Array,
    borrowerSecret: Uint8Array,
    atts: { bank: Attestation; salary: Attestation; repay: Attestation },
  ) {
    const subject = this.subjectId(borrowerSecret);
    for (const [tag, att] of [
      [FIELD_TAG.bank, atts.bank],
      [FIELD_TAG.salary, atts.salary],
      [FIELD_TAG.repay, atts.repay],
    ] as const) {
      const leaf = attestationLeaf(tag, att, subject);
      await this.issueAttestation(issuerSecret, leaf);
    }
  }

  // --- circuits -------------------------------------------------------

  issueAttestation(issuerSecret: Uint8Array, leaf: Uint8Array) {
    return this.call(emptyPrivateState(issuerSecret), (ctx) =>
      this.contract.impureCircuits.issueAttestation(ctx, leaf),
    );
  }

  depositLiquidity(amount: bigint) {
    return this.call(emptyPrivateState(new Uint8Array(32)), (ctx) =>
      this.contract.impureCircuits.depositLiquidity(ctx, amount),
    );
  }

  withdrawLiquidity(amount: bigint) {
    return this.call(emptyPrivateState(new Uint8Array(32)), (ctx) =>
      this.contract.impureCircuits.withdrawLiquidity(ctx, amount),
    );
  }

  borrow(ps: DefiPrivateState, useTier1: boolean, amount: bigint, collateral: bigint, dueTime: bigint) {
    return this.call(ps, (ctx) =>
      this.contract.impureCircuits.borrow(ctx, useTier1, amount, collateral, dueTime),
    );
  }

  repay(ps: DefiPrivateState, amount: bigint) {
    return this.call(ps, (ctx) => this.contract.impureCircuits.repay(ctx, amount));
  }

  liquidate(nullifier: Uint8Array) {
    return this.call(emptyPrivateState(new Uint8Array(32)), (ctx) =>
      this.contract.impureCircuits.liquidate(ctx, nullifier),
    );
  }
}

export function borrowerState(
  secret: Uint8Array,
  atts: { bank: Attestation; salary: Attestation; repay: Attestation },
  crossChainScore = 0n,
): DefiPrivateState {
  return { callerSecret: secret, ...atts, crossChainScore };
}
