// defi1 — the contracts package's public surface.
//
// The app imports the compiled contract from here (`@defi1/contracts`) so that
// transaction assembly runs the *same* generated circuit code the test suite
// does, rather than a second copy that could drift.
//
// `src/managed/` is build output — run `npm run compact` in this package before
// building the app. It is gitignored deliberately: it is 25MB of proving keys
// plus generated bindings, and it is reproducible from `lending.compact`.

export {
  Contract,
  ledger,
  pureCircuits,
  contractReferenceLocations,
  expectedVk,
} from "./managed/lending/contract/index.js";

export type {
  Circuits,
  ImpureCircuits,
  Ledger,
  PureCircuits,
  Witnesses,
} from "./managed/lending/contract/index.js";

// Extensionless on purpose: these are TypeScript sources, and the app's
// bundler resolves them as such. Only `managed/.../index.js` above keeps its
// extension, because it really is a JavaScript file the compiler emitted.
export * from "./witnesses";
export * from "./score";
export * from "./issuer";

/** The circuits a client can call, i.e. everything but the constructor. */
export const CIRCUIT_IDS = [
  "issueAttestation",
  "depositLiquidity",
  "withdrawLiquidity",
  "borrow",
  "repay",
  "liquidate",
] as const;

export type CircuitId = (typeof CIRCUIT_IDS)[number];
