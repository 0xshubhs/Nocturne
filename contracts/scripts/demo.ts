// Nocturne — the end-to-end demo run (plan.md §7).
//
//   npm run demo
//
// Everything below executes the *real* compiled circuits through the in-memory
// simulator: same score arithmetic, same Merkle checks, same asserts a proof
// would enforce on-chain. Only the proof server and the network are stubbed.
//
// The narrative, in one line: Alice and Bob post identical collateral, Alice
// borrows 3x more because her private score is stronger, and the chain never
// learns why — until Bob defaults, when it learns exactly one thing about
// exactly one person.

import { AttestationIssuer, DEMO_PERSONAS, toHex, type AttestationField } from "../src/issuer.js";
import { computeScore, interestDue, TIER_RULES } from "../src/score.js";
import { borrowerState, LendingSim } from "../test/simulator.js";
import type { Attestation } from "../src/witnesses.js";

const ISSUER = new Uint8Array(32).fill(7);
const ALICE = new Uint8Array(32).fill(11);
const BOB = new Uint8Array(32).fill(22);

const NOW = 1_700_000_000; // a realistic unix timestamp
const EXPIRY = BigInt(NOW + 365 * 24 * 3600);
const TERM = 30n * 24n * 3600n; // 30 days, inside the 90-day cap
const DUE = BigInt(NOW) + TERM;

const COLLATERAL = 1000n;
const SEED_LIQUIDITY = 1_000_000n;

// Bob has verified an external wallet; Alice has not. Even with the boost Bob
// stays under the tier-1 threshold — the point is that it *counts*, privately.
// The value is an issuer-minted attestation like any other, not a number Bob
// gets to assert.
const BOB_CROSS_CHAIN = DEMO_PERSONAS.bob.crossChain;

const BAR = "─".repeat(72);
const say = (s = "") => console.log(s);
const step = (n: number, title: string) => {
  say();
  say(`\x1b[1m${n}. ${title}\x1b[0m`);
  say(BAR);
};

function attsFor(values: Record<AttestationField, bigint>): Record<AttestationField, Attestation> {
  return {
    bank: { value: values.bank, expiry: EXPIRY },
    salary: { value: values.salary, expiry: EXPIRY },
    repay: { value: values.repay, expiry: EXPIRY },
    crossChain: { value: values.crossChain, expiry: EXPIRY },
  };
}

/** Everything an outside observer can read off the ledger. */
function chainView(sim: LendingSim) {
  const l = sim.ledger;
  const loans = [...l.loans].map(([nullifier, loan]) => ({
    nullifier: `${toHex(nullifier).slice(0, 12)}…`,
    tier: Number(loan.tier),
    principal: loan.principal,
    collateral: loan.collateral,
    dueTime: loan.dueTime,
  }));
  return {
    poolLiquidity: l.poolLiquidity,
    loanCount: l.loanCount,
    attestationLeaves: l.attestationRoot.firstFree(),
    loans,
    defaulters: [...l.defaulters].map((n) => `${toHex(n).slice(0, 12)}…`),
  };
}

function printChainView(sim: LendingSim) {
  const v = chainView(sim);
  say(`  pool liquidity      ${v.poolLiquidity}`);
  say(`  loans opened        ${v.loanCount}`);
  say(`  attestation leaves  ${v.attestationLeaves}`);
  if (v.loans.length === 0) {
    say("  outstanding loans   (none)");
  } else {
    say("  outstanding loans");
    for (const loan of v.loans) {
      say(
        `    ${loan.nullifier}  tier ${loan.tier}  principal ${String(loan.principal).padStart(5)}` +
          `  collateral ${loan.collateral}  due ${loan.dueTime}`,
      );
    }
  }
  say(`  defaulters          ${v.defaulters.length ? v.defaulters.join(", ") : "(none)"}`);
}

async function main() {
  step(1, "Seed the pool and stand up the issuer");
  const sim = await LendingSim.deploy(ISSUER);
  sim.setTime(NOW);
  await sim.depositLiquidity(SEED_LIQUIDITY);
  const issuer = new AttestationIssuer(ISSUER, (leaf) =>
    sim.issueAttestation(ISSUER, leaf).then(() => undefined),
  );
  say(`  issuer public key   ${toHex(issuer.publicKey).slice(0, 24)}…`);
  say(`  matches ledger      ${toHex(issuer.publicKey) === toHex(sim.ledger.issuerPk)}`);
  say(`  pool liquidity      ${sim.ledger.poolLiquidity}`);

  step(2, "Issue attestations — the values never touch the chain");
  await issuer.issuePersona("alice", ALICE, EXPIRY);
  await issuer.issuePersona("bob", BOB, EXPIRY);
  const aliceAtts = attsFor(DEMO_PERSONAS.alice);
  const bobAtts = attsFor(DEMO_PERSONAS.bob);

  const aliceScore = computeScore(aliceAtts.bank, aliceAtts.salary, aliceAtts.repay, 0n, BigInt(NOW));
  const bobScore = computeScore(bobAtts.bank, bobAtts.salary, bobAtts.repay, BOB_CROSS_CHAIN, BigInt(NOW));

  say("  locally, each borrower knows their own figures:");
  say(`    alice  bank ${DEMO_PERSONAS.alice.bank}  salary ${DEMO_PERSONAS.alice.salary}` +
      `  repay ${DEMO_PERSONAS.alice.repay}  cross-chain 0    -> score ${aliceScore}`);
  say(`    bob    bank ${DEMO_PERSONAS.bob.bank}  salary ${DEMO_PERSONAS.bob.salary}` +
      `   repay ${DEMO_PERSONAS.bob.repay}   cross-chain ${BOB_CROSS_CHAIN}  -> score ${bobScore}`);
  say();
  say(`  the chain got ${sim.ledger.attestationRoot.firstFree()} opaque 32-byte leaves and nothing else:`);
  printChainView(sim);

  step(3, "Identical collateral, different tiers");
  const aliceMax = (COLLATERAL * TIER_RULES[1].maxLtvBps) / 10000n;
  const bobMax = (COLLATERAL * TIER_RULES[0].maxLtvBps) / 10000n;
  say(`  both post collateral ${COLLATERAL}`);
  say(`  alice score ${aliceScore} >= ${TIER_RULES[1].minScore} -> tier 1, max LTV ` +
      `${Number(TIER_RULES[1].maxLtvBps) / 100}% -> can borrow ${aliceMax}`);
  say(`  bob   score ${bobScore} >= ${TIER_RULES[0].minScore} -> tier 0, max LTV ` +
      `${Number(TIER_RULES[0].maxLtvBps) / 100}%  -> can borrow ${bobMax}`);
  say();
  say(`  bob cannot reach tier 1: ${bobScore} < ${TIER_RULES[1].minScore}. The circuit ` +
      "rejects the attempt —");
  try {
    await sim.borrow(borrowerState(BOB, bobAtts), true, bobMax, COLLATERAL, DUE);
    say("    ...it did not. That is a bug.");
  } catch (err) {
    say(`    ${(err as Error).message}`);
  }

  step(4, "Borrow");
  await sim.borrow(borrowerState(ALICE, aliceAtts), true, aliceMax, COLLATERAL, DUE);
  await sim.borrow(borrowerState(BOB, bobAtts), false, bobMax, COLLATERAL, DUE);
  say(`  alice borrowed ${aliceMax} against ${COLLATERAL}`);
  say(`  bob   borrowed ${bobMax} against ${COLLATERAL}`);
  say(`  \x1b[1mdelta: ${aliceMax / bobMax}x on identical collateral\x1b[0m`);
  say();
  say(`  interest at maturity (${TERM / 86400n} days):`);
  say(`    alice ${interestDue(aliceMax, TIER_RULES[1].aprBps, TERM)} @ ` +
      `${Number(TIER_RULES[1].aprBps) / 100}% APR`);
  say(`    bob   ${interestDue(bobMax, TIER_RULES[0].aprBps, TERM)} @ ` +
      `${Number(TIER_RULES[0].aprBps) / 100}% APR`);

  step(5, "What the chain sees");
  printChainView(sim);
  say();
  say("  what it does NOT see, for either borrower:");
  say("    · which wallet is behind a nullifier");
  say("    · the credit score, or that alice's is higher than bob's");
  say("    · any attestation value — bank, salary, repayment history");
  say("    · that bob linked an external wallet at all, let alone which one");

  step(6, "Alice repays, Bob defaults");
  await sim.repay(borrowerState(ALICE, aliceAtts), aliceMax);
  say(`  alice repaid ${aliceMax} — her nullifier is free again, no trace of who she was`);
  say(`  alice still active? ${sim.ledger.activeNullifiers.member(sim.nullifier(ALICE))}`);
  say();
  say("  while the loan is still in term, nobody can touch it —");
  try {
    await sim.liquidate(sim.nullifier(BOB));
    say("    ...it was liquidated early. That is a bug.");
  } catch (err) {
    say(`    ${(err as Error).message}`);
  }

  say();
  say(`  time advances past the due date (${DUE}) — bob has not repaid`);
  sim.setTime(Number(DUE) + 1);
  await sim.liquidate(sim.nullifier(BOB));
  say(`  liquidated. collateral ${COLLATERAL} seized into the pool.`);

  step(7, "Liquidation reveals exactly one thing about exactly one person");
  printChainView(sim);
  say();
  const defaulters = [...sim.ledger.defaulters];
  say(`  defaulter set holds ${defaulters.length} entry: a 32-byte nullifier`);
  say(`  is it bob's?    ${sim.ledger.defaulters.member(sim.nullifier(BOB))}`);
  say(`  is alice in it? ${sim.ledger.defaulters.member(sim.nullifier(ALICE))}`);
  say();
  say("  even now the chain does not learn bob's score, his attestation values,");
  say("  his linked wallet, or anything at all about alice.");

  say();
  say(BAR);
  say("\x1b[1mdemo complete\x1b[0m");
  say();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
