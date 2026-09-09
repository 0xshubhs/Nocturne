// Nocturne — mint the demo attestation set for Alice (strong) and Bob (thin file).
//
//   npm run issuer:mint            # run against a fresh in-memory simulator
//   npm run issuer:mint -- --json  # emit only the JSON bundle
//
// The JSON bundle is what a borrower client seeds its encrypted private state
// with. Against a real network, swap `submitLeaf` for a call that submits
// `issueAttestation` through the deployed contract.

import { LendingSim } from "../test/simulator.js";
import {
  AttestationIssuer,
  ATTESTATION_FIELDS,
  fromHex,
  generateIssuerSecret,
  toHex,
  type IssuedAttestation,
  type PersonaName,
} from "../src/issuer.js";

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const log = (...a: unknown[]) => !jsonOnly && console.log(...a);

// Deterministic demo keys (override with NOCTURNE_ISSUER_SECRET=<hex>).
const issuerSecret = process.env.NOCTURNE_ISSUER_SECRET
  ? fromHex(process.env.NOCTURNE_ISSUER_SECRET)
  : new Uint8Array(32).fill(7);
const subjectSecrets: Record<PersonaName, Uint8Array> = {
  alice: new Uint8Array(32).fill(11),
  bob: new Uint8Array(32).fill(22),
};

const NOW = Math.floor(Date.now() / 1000);
const EXPIRY = BigInt(NOW + 365 * 24 * 3600);

async function main() {
  const sim = await LendingSim.deploy(issuerSecret);
  sim.setTime(NOW);

  const issuer = new AttestationIssuer(issuerSecret, (leaf) =>
    sim.issueAttestation(issuerSecret, leaf).then(() => undefined),
  );

  log(`issuer public key : ${toHex(issuer.publicKey)}`);
  log(`contract issuerPk : ${toHex(sim.ledger.issuerPk)}`);
  log("");

  const bundle: Record<string, unknown> = {
    issuerPublicKey: toHex(issuer.publicKey),
    expiry: EXPIRY.toString(),
    personas: {} as Record<string, unknown>,
  };

  for (const persona of ["alice", "bob"] as const) {
    const secret = subjectSecrets[persona];
    const atts = await issuer.issuePersona(persona, secret, EXPIRY);
    log(`${persona}:`);
    for (const field of ATTESTATION_FIELDS) {
      const a: IssuedAttestation = atts[field];
      log(`  ${field.padEnd(7)} value=${a.value}  expiry=${a.expiry}`);
    }
    (bundle.personas as Record<string, unknown>)[persona] = {
      subjectSecret: toHex(secret),
      attestations: Object.fromEntries(
        ATTESTATION_FIELDS.map((f) => [
          f,
          { value: atts[f].value.toString(), expiry: atts[f].expiry.toString() },
        ]),
      ),
    };
  }

  log("");
  log(`attestation tree leaves: ${sim.ledger.attestationRoot.firstFree()}`);
  log("");
  console.log(JSON.stringify(bundle, null, 2));
}

// Ensure a fresh random issuer key is easy to generate for real deployments.
if (args.includes("--new-key")) {
  console.log(toHex(generateIssuerSecret()));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
