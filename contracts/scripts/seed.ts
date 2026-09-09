// Nocturne — seed a pool with liquidity and mint the demo personas (plan.md §7).
//
//   npm run seed                        # narrate, then print the bundle
//   npm run seed -- --json              # bundle only (pipe it somewhere)
//   npm run seed -- --out ../seed.json  # write the bundle to a file
//   npm run seed -- --liquidity 5000000
//
// Runs against a fresh in-memory simulator. Against a real deployment, swap
// `submitLeaf` for a call that submits `issueAttestation` through the deployed
// contract and replace `depositLiquidity` with the same via the wallet.
//
// The emitted bundle is what a borrower client seeds its encrypted private
// state with, and what the app's demo mode loads.

import { writeFileSync } from "node:fs";
import {
  AttestationIssuer,
  ATTESTATION_FIELDS,
  fromHex,
  toHex,
  type PersonaName,
} from "../src/issuer.js";
import { computeScore, tierFor, TIER_RULES } from "../src/score.js";
import { LendingSim } from "../test/simulator.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const jsonOnly = args.includes("--json");
const outPath = flag("out");
const log = (...a: unknown[]) => !jsonOnly && console.log(...a);

const LIQUIDITY = BigInt(flag("liquidity") ?? "1000000");

// Deterministic demo keys — override the issuer with NOCTURNE_ISSUER_SECRET=<hex>.
const issuerSecret = process.env.NOCTURNE_ISSUER_SECRET
  ? fromHex(process.env.NOCTURNE_ISSUER_SECRET)
  : new Uint8Array(32).fill(7);
const subjectSecrets: Record<PersonaName, Uint8Array> = {
  alice: new Uint8Array(32).fill(11),
  bob: new Uint8Array(32).fill(22),
};

// Bob has a verified external wallet; Alice does not — the values live in
// DEMO_PERSONAS and are minted by the issuer as `crossChain` attestations.

const NOW = Math.floor(Date.now() / 1000);
const EXPIRY = BigInt(NOW + 365 * 24 * 3600);

async function main() {
  const sim = await LendingSim.deploy(issuerSecret);
  sim.setTime(NOW);
  await sim.depositLiquidity(LIQUIDITY);

  const issuer = new AttestationIssuer(issuerSecret, (leaf) =>
    sim.issueAttestation(issuerSecret, leaf).then(() => undefined),
  );

  log(`pool liquidity     ${sim.ledger.poolLiquidity}`);
  log(`issuer public key  ${toHex(issuer.publicKey)}`);
  log(`ledger issuerPk    ${toHex(sim.ledger.issuerPk)}`);
  log("");

  const personas: Record<string, unknown> = {};

  for (const persona of ["alice", "bob"] as const) {
    const secret = subjectSecrets[persona];
    const atts = await issuer.issuePersona(persona, secret, EXPIRY);
    const cross = atts.crossChain.value;
    const score = computeScore(atts.bank, atts.salary, atts.repay, cross, BigInt(NOW));
    const tier = tierFor(score);
    const maxBorrow =
      tier === null ? 0n : (1000n * TIER_RULES[tier].maxLtvBps) / 10000n;

    log(`${persona}:`);
    for (const field of ATTESTATION_FIELDS) {
      log(`  ${field.padEnd(7)} value=${String(atts[field].value).padStart(4)}  expiry=${atts[field].expiry}`);
    }
    log(`  cross-chain ${cross}  ->  score ${score}, tier ${tier ?? "none"}, ` +
        `max borrow ${maxBorrow} per 1000 collateral`);
    log("");

    personas[persona] = {
      subjectSecret: toHex(secret),
      nullifier: toHex(sim.nullifier(secret)),
      subjectId: toHex(sim.subjectId(secret)),
      crossChainScore: cross.toString(),
      score: score.toString(),
      tier,
      attestations: Object.fromEntries(
        ATTESTATION_FIELDS.map((f) => [
          f,
          { value: atts[f].value.toString(), expiry: atts[f].expiry.toString() },
        ]),
      ),
    };
  }

  log(`attestation leaves ${sim.ledger.attestationRoot.firstFree()}`);
  log("");

  const bundle = {
    version: 1,
    seededAt: NOW,
    poolLiquidity: sim.ledger.poolLiquidity.toString(),
    issuerPublicKey: toHex(issuer.publicKey),
    expiry: EXPIRY.toString(),
    tierRules: {
      0: {
        minScore: TIER_RULES[0].minScore.toString(),
        maxLtvBps: TIER_RULES[0].maxLtvBps.toString(),
        aprBps: TIER_RULES[0].aprBps.toString(),
      },
      1: {
        minScore: TIER_RULES[1].minScore.toString(),
        maxLtvBps: TIER_RULES[1].maxLtvBps.toString(),
        aprBps: TIER_RULES[1].aprBps.toString(),
      },
    },
    personas,
  };

  const json = JSON.stringify(bundle, null, 2);
  if (outPath) {
    writeFileSync(outPath, json + "\n");
    log(`wrote ${outPath}`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
