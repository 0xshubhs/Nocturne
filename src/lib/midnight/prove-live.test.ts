// Nocturne — the proving step, for real.
//
// Everything else in the suite stops short of a proof: the wallet is the only
// prover a user has, there is no headless wallet for this stack, and the
// ledger's WASM traps rather than throwing when handed invalid proof bytes, so
// a fake prover cannot stand in for a real one.
//
// This closes that gap by assembling a real transaction and proving it against
// a running `midnight-proof-server`:
//
//   docker run -d --name nocturne-proof-server -p 6300:6300 \
//     midnightnetwork/proof-server:latest
//
// Skipped when the server is not up, so the default `npm test` stays fast and
// hermetic. Run it with the server running to verify the real thing.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { proofServerProvingProvider, proofServerVersion } from "./proof-server-provider";
import { HttpZKConfigProvider } from "./zk-config";
import type { BorrowerPrivateState } from "./lending";

const PROOF_SERVER = process.env.NOCTURNE_PROOF_SERVER ?? "http://127.0.0.1:6300";
const MANAGED = join(process.cwd(), "contracts/src/managed/lending");
const COMPILED = existsSync(join(MANAGED, "contract/index.js"));
const KEYED = existsSync(join(MANAGED, "keys/depositLiquidity.prover"));

const config = { ...defaultConfig("undeployed"), zkAssetBasePath: "/zk/lending" };

/** Serves the compiler's output and the indexer over the fetch seam. */
function diskFetch(contractStateHex?: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    // Anything aimed at the proof server is a real network call.
    if (url.startsWith(PROOF_SERVER)) return fetch(input as RequestInfo, init);

    if (init?.method === "POST" && url.includes("graphql")) {
      const body = contractStateHex
        ? { data: { contractAction: { state: contractStateHex, transaction: { block: { height: 1 } } } } }
        : { data: { contractAction: null } };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    const match = /\/zk\/lending\/(keys|zkir)\/(.+)$/.exec(url);
    if (match) {
      const file = join(MANAGED, match[1], match[2]);
      if (!existsSync(file)) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(readFileSync(file)), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

const fakeApi = {
  getShieldedAddresses: async () => ({
    shieldedAddress: "mn_shield-addr_test",
    shieldedCoinPublicKey: "00".repeat(32),
    shieldedEncryptionPublicKey: "01".repeat(32),
  }),
} as never;

const privateState: BorrowerPrivateState = { callerSecret: new Uint8Array(32).fill(7) };

let serverUp = false;
let serverVersion: string | null = null;

beforeAll(async () => {
  serverVersion = await proofServerVersion(PROOF_SERVER);
  serverUp = serverVersion !== null;
  if (!serverUp) {
    console.warn(
      `\n  [prove-live] no proof server at ${PROOF_SERVER} — skipping. Start one with:\n` +
        "    docker run -d --name nocturne-proof-server -p 6300:6300 midnightnetwork/proof-server:latest\n",
    );
  }
});

const ready = COMPILED && KEYED;
const suite = ready ? describe : describe.skip;

suite("proving against a real proof server", () => {
  it("reports a version", () => {
    if (!serverUp) return;
    expect(serverVersion).toBeTruthy();
  });

  it("proves a real depositLiquidity call end to end", async () => {
    if (!serverUp) return;

    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");

    // A real deployment, so the state's operations carry real verifier keys.
    const deployAssembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(),
    });
    const deploy = await deployAssembler.deploy(new Uint8Array(32).fill(7), privateState);

    // That state, fed back the way the indexer would return it.
    const assembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(serializeContractStateHex(deploy.initialContractState)),
    });
    const call = await assembler.call(
      deploy.contractAddress,
      "depositLiquidity",
      [1000n],
      privateState,
    );

    const unproven = call.serializeUnproven();
    expect(unproven.length).toBeGreaterThan(256);

    // The real thing: the ledger drives the prover, the prover talks to the
    // proof server, and a proven transaction comes back.
    const provider = proofServerProvingProvider({
      url: PROOF_SERVER,
      keyMaterial: new HttpZKConfigProvider(config.zkAssetBasePath, diskFetch()),
    });

    const proven = await call.prove(provider);

    expect(proven).toMatch(/^[0-9a-f]+$/);
    // A proof is not free: the proven transaction is materially bigger than the
    // unproven one it came from.
    expect(proven.length).toBeGreaterThan(unproven.length);
  }, 900_000);

  // `borrow` is the circuit the whole product rests on: it verifies four Merkle
  // paths, computes the score over private data, and discloses a single bit
  // about it. It is also by far the largest — a 19MB prover key against 74KB
  // for depositLiquidity — so this is the case that says whether a live demo is
  // actually viable, and how long a borrower waits.
  it("proves a real borrow, the circuit the demo depends on", async () => {
    if (!serverUp) return;

    const { MidnightTxAssembler, serializeContractStateHex } = await import("./tx-assembler");
    const { attestationLeaf, FIELD_TAG, pureCircuits, DEMO_PERSONAS } = await import("@nocturne/contracts");

    const ISSUER = new Uint8Array(32).fill(7);
    const ALICE = new Uint8Array(32).fill(11);
    const EXPIRY = 4_000_000_000n;

    // Deploy, then walk the contract forward locally: issue Alice's four
    // attestation leaves, then fund the pool. Each call hands back the state it
    // would leave behind, which the next one runs against.
    let assembler = await MidnightTxAssembler.create({ api: fakeApi, config, fetchImpl: diskFetch() });
    const deploy = await assembler.deploy(ISSUER, { callerSecret: ISSUER });

    let stateHex = serializeContractStateHex(deploy.initialContractState);
    const advance = async (
      circuit: "issueAttestation" | "depositLiquidity",
      args: readonly unknown[],
      secret: Uint8Array,
    ) => {
      assembler = await MidnightTxAssembler.create({
        api: fakeApi,
        config,
        fetchImpl: diskFetch(stateHex),
      });
      const c = await assembler.call(deploy.contractAddress, circuit, args, { callerSecret: secret });
      stateHex = serializeContractStateHex(c.nextContractState);
    };

    const subject = pureCircuits.makeSubjectId(ALICE);
    const atts = {
      bank: { value: DEMO_PERSONAS.alice.bank, expiry: EXPIRY },
      salary: { value: DEMO_PERSONAS.alice.salary, expiry: EXPIRY },
      repay: { value: DEMO_PERSONAS.alice.repay, expiry: EXPIRY },
      crossChain: { value: DEMO_PERSONAS.alice.crossChain, expiry: EXPIRY },
    };
    for (const field of ["bank", "salary", "repay", "crossChain"] as const) {
      await advance("issueAttestation", [attestationLeaf(FIELD_TAG[field], atts[field], subject)], ISSUER);
    }
    await advance("depositLiquidity", [1_000_000n], ISSUER);

    // Now the borrow itself: tier 1, 1500 against 1000 collateral — the 3x the
    // demo turns on.
    assembler = await MidnightTxAssembler.create({
      api: fakeApi,
      config,
      fetchImpl: diskFetch(stateHex),
    });
    const dueTime = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
    const borrow = await assembler.call(
      deploy.contractAddress,
      "borrow",
      [true, 1500n, 1000n, dueTime],
      { callerSecret: ALICE, ...atts },
    );

    const provider = proofServerProvingProvider({
      url: PROOF_SERVER,
      keyMaterial: new HttpZKConfigProvider(config.zkAssetBasePath, diskFetch()),
    });

    const started = Date.now();
    const proven = await borrow.prove(provider);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    expect(proven).toMatch(/^[0-9a-f]+$/);
    expect(proven.length).toBeGreaterThan(borrow.serializeUnproven().length);
    console.log(
      `\n  [prove-live] borrow proved in ${seconds}s — ` +
        `${(proven.length / 2 / 1024).toFixed(1)}KB proven transaction\n`,
    );
  }, 1_800_000);
});
