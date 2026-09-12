import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  callerSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  bankAttestation(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [bigint,
                                                                               bigint,
                                                                               { leaf: Uint8Array,
                                                                                 path: { sibling: { field: bigint
                                                                                                  },
                                                                                         goes_left: boolean
                                                                                       }[]
                                                                               }]];
  salaryAttestation(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [bigint,
                                                                                 bigint,
                                                                                 { leaf: Uint8Array,
                                                                                   path: { sibling: { field: bigint
                                                                                                    },
                                                                                           goes_left: boolean
                                                                                         }[]
                                                                                 }]];
  repayAttestation(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [bigint,
                                                                                bigint,
                                                                                { leaf: Uint8Array,
                                                                                  path: { sibling: { field: bigint
                                                                                                   },
                                                                                          goes_left: boolean
                                                                                        }[]
                                                                                }]];
  crossChainAttestation(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, [bigint,
                                                                                     bigint,
                                                                                     { leaf: Uint8Array,
                                                                                       path: { sibling: { field: bigint
                                                                                                        },
                                                                                               goes_left: boolean
                                                                                             }[]
                                                                                     }]];
}

export type ImpureCircuits<PS> = {
  issueAttestation(context: __compactRuntime.CircuitContext<PS>,
                   leaf_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  depositLiquidity(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawLiquidity(context: __compactRuntime.CircuitContext<PS>,
                    amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  borrow(context: __compactRuntime.CircuitContext<PS>,
         useTier1_0: boolean,
         amount_0: bigint,
         collateral_0: bigint,
         dueTime_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  liquidate(context: __compactRuntime.CircuitContext<PS>,
            nullifier_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  issueAttestation(context: __compactRuntime.CircuitContext<PS>,
                   leaf_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  depositLiquidity(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawLiquidity(context: __compactRuntime.CircuitContext<PS>,
                    amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  borrow(context: __compactRuntime.CircuitContext<PS>,
         useTier1_0: boolean,
         amount_0: bigint,
         collateral_0: bigint,
         dueTime_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  liquidate(context: __compactRuntime.CircuitContext<PS>,
            nullifier_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
  maxLoanTermSeconds(): bigint;
  deriveIssuerPk(sk_0: Uint8Array): Uint8Array;
  makeNullifier(sk_0: Uint8Array): Uint8Array;
  makeSubjectId(sk_0: Uint8Array): Uint8Array;
  attestationLeaf(fieldTag_0: Uint8Array,
                  value_0: bigint,
                  expiry_0: bigint,
                  subject_0: Uint8Array): Uint8Array;
  scoreOf(bankValue_0: bigint,
          salaryValue_0: bigint,
          repayValue_0: bigint,
          crossChain_0: bigint): bigint;
}

export type Circuits<PS> = {
  maxLoanTermSeconds(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  deriveIssuerPk(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  makeNullifier(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  makeSubjectId(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  attestationLeaf(context: __compactRuntime.CircuitContext<PS>,
                  fieldTag_0: Uint8Array,
                  value_0: bigint,
                  expiry_0: bigint,
                  subject_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, Uint8Array>>;
  scoreOf(context: __compactRuntime.CircuitContext<PS>,
          bankValue_0: bigint,
          salaryValue_0: bigint,
          repayValue_0: bigint,
          crossChain_0: bigint): Promise<__compactRuntime.CircuitResults<PS, bigint>>;
  issueAttestation(context: __compactRuntime.CircuitContext<PS>,
                   leaf_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  depositLiquidity(context: __compactRuntime.CircuitContext<PS>,
                   amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  withdrawLiquidity(context: __compactRuntime.CircuitContext<PS>,
                    amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  borrow(context: __compactRuntime.CircuitContext<PS>,
         useTier1_0: boolean,
         amount_0: bigint,
         collateral_0: bigint,
         dueTime_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  repay(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  liquidate(context: __compactRuntime.CircuitContext<PS>,
            nullifier_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly issuerPk: Uint8Array;
  attestationRoot: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  readonly poolLiquidity: bigint;
  readonly tier0: { minScore: bigint, maxLtvBps: bigint, aprBps: bigint };
  readonly tier1: { minScore: bigint, maxLtvBps: bigint, aprBps: bigint };
  loans: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { tier: bigint,
                                 principal: bigint,
                                 collateral: bigint,
                                 dueTime: bigint,
                                 active: boolean
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { tier: bigint,
  principal: bigint,
  collateral: bigint,
  dueTime: bigint,
  active: boolean
}]>
  };
  activeNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly loanCount: bigint;
  defaulters: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>,
               issuerSecret_0: Uint8Array): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
