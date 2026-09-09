// defi1 — mock attestation issuer.
//
// Stands in for banks / credit bureaus / oracles. The issuer holds a secret,
// maintains the on-chain `attestationRoot` (a HistoricMerkleTree), and inserts
// one commitment leaf per attestation via `issueAttestation(leaf)`. A borrower
// later proves, in-circuit, that its (field, value, expiry, subject) leaf sits
// in that root.
//
// Transport-agnostic: give it a `submitLeaf` that talks to a simulator, a local
// node, or preprod. `scripts/mint-personas.ts` drives it for the demo.

import { pureCircuits } from "./managed/lending/contract/index.js";
import { attestationLeaf, FIELD_TAG, type Attestation } from "./witnesses.js";

export type AttestationField = "bank" | "salary" | "repay" | "crossChain";

export const ATTESTATION_FIELDS: readonly AttestationField[] = [
  "bank",
  "salary",
  "repay",
  "crossChain",
] as const;

const FIELD_TAGS: Record<AttestationField, Uint8Array> = {
  bank: FIELD_TAG.bank,
  salary: FIELD_TAG.salary,
  repay: FIELD_TAG.repay,
  crossChain: FIELD_TAG.crossChain,
};

/** A signed-off attestation plus the field it covers (what the borrower stores). */
export type IssuedAttestation = Attestation & { field: AttestationField };

export type IssueRequest = {
  /** The borrower's identity secret. Used only to derive the subject id. */
  subjectSecret: Uint8Array;
  field: AttestationField;
  value: bigint;
  /** Unix seconds. The circuit rejects the attestation once block time >= this. */
  expiry: bigint;
};

/** How the issuer publishes a leaf. Return once it is durably in the tree. */
export type SubmitLeaf = (leaf: Uint8Array) => Promise<void>;

export class AttestationIssuer {
  constructor(
    private readonly issuerSecret: Uint8Array,
    private readonly submitLeaf: SubmitLeaf,
  ) {
    if (issuerSecret.length !== 32) throw new Error("issuer secret must be 32 bytes");
  }

  /** The domain-hashed public key the contract stores as `issuerPk`. */
  get publicKey(): Uint8Array {
    return pureCircuits.deriveIssuerPk(this.issuerSecret);
  }

  /** The subject id the contract binds an attestation to. */
  subjectIdFor(subjectSecret: Uint8Array): Uint8Array {
    return pureCircuits.makeSubjectId(subjectSecret);
  }

  /** The exact leaf that will be inserted for a request (useful for tests / audit). */
  leafFor(req: IssueRequest): Uint8Array {
    return attestationLeaf(
      FIELD_TAGS[req.field],
      { value: req.value, expiry: req.expiry },
      this.subjectIdFor(req.subjectSecret),
    );
  }

  /** Issue one attestation: publish its leaf, hand back the record to store. */
  async issue(req: IssueRequest): Promise<IssuedAttestation> {
    await this.submitLeaf(this.leafFor(req));
    return { field: req.field, value: req.value, expiry: req.expiry };
  }

  /** Issue a full set (bank / salary / repay / crossChain) for one subject. */
  async issueSet(
    subjectSecret: Uint8Array,
    values: Record<AttestationField, bigint>,
    expiry: bigint,
  ): Promise<Record<AttestationField, IssuedAttestation>> {
    const out = {} as Record<AttestationField, IssuedAttestation>;
    for (const field of ATTESTATION_FIELDS) {
      out[field] = await this.issue({ subjectSecret, field, value: values[field], expiry });
    }
    return out;
  }

  /**
   * Re-attest the cross-chain contribution after a borrower proved ownership of
   * an external wallet. The old leaf stays in the historic tree — harmless,
   * since only the issuer can mint a higher one.
   */
  async attestCrossChain(
    subjectSecret: Uint8Array,
    value: bigint,
    expiry: bigint,
  ): Promise<IssuedAttestation> {
    if (value > MAX_CROSS_CHAIN_SCORE) {
      throw new Error(
        `cross-chain contribution ${value} exceeds the cap of ${MAX_CROSS_CHAIN_SCORE}`,
      );
    }
    return this.issue({ subjectSecret, field: "crossChain", value, expiry });
  }

  /** Issue the preset band for a named demo persona. */
  async issuePersona(
    persona: PersonaName,
    subjectSecret: Uint8Array,
    expiry: bigint,
  ): Promise<Record<AttestationField, IssuedAttestation>> {
    return this.issueSet(subjectSecret, DEMO_PERSONAS[persona], expiry);
  }
}

// ---------------------------------------------------------------------------
// Demo personas — attestation value bands, tuned against the tier table in
// lending.compact (tier0 minScore 500, tier1 minScore 750;
// score = bank*2 + salary*3 + repay*4 + crossChain).
// ---------------------------------------------------------------------------

export type PersonaName = "alice" | "bob";

export const DEMO_PERSONAS: Record<PersonaName, Record<AttestationField, bigint>> = {
  // 200*2 + 150*3 + 90*4 + 0 = 1210  ->  clears tier 1 outright, no linked wallet
  alice: { bank: 200n, salary: 150n, repay: 90n, crossChain: 0n },
  // 100*2 + 80*3 + 15*4 + 120 = 620  ->  tier 0; the linked wallet helps but
  // does not close a 250-point gap on its own
  bob: { bank: 100n, salary: 80n, repay: 15n, crossChain: 120n },
};

/**
 * Ceiling on what a verified external wallet can contribute. The issuer
 * enforces it when minting; the borrower cannot mint at all.
 */
export const MAX_CROSS_CHAIN_SCORE = 300n;

// ---------------------------------------------------------------------------
// Keypair helpers
// ---------------------------------------------------------------------------

export function generateIssuerSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export function issuerPublicKey(issuerSecret: Uint8Array): Uint8Array {
  return pureCircuits.deriveIssuerPk(issuerSecret);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("hex string has odd length");
  return new Uint8Array(clean.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
}
