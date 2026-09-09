// Nocturne — where the compiled ZK artifacts come from in the browser.
//
// `npm run sync:zk` copies the compiler's output into `public/zk/lending/`;
// this serves it over HTTP to two consumers that want it in different shapes:
//
//   · transaction assembly, which asks by circuit id for the verifier keys it
//     stamps into each call;
//   · the wallet's prover, which asks by *contract key location* — a
//     contract-qualified identifier embedding the deployed verifier key's hash.
//     `asKeyMaterialProvider()` on the base class returns `this`, so the same
//     methods see both shapes; `FetchKeyMaterialProvider` reduces either to a
//     circuit name.

import { ZKConfigProvider } from "@midnight-ntwrk/midnight-js-types";
import type { ProverKey, VerifierKey, ZKIR } from "@midnight-ntwrk/midnight-js-types";
import { FetchKeyMaterialProvider } from "./providers";

export class HttpZKConfigProvider extends ZKConfigProvider<string> {
  private readonly keys: FetchKeyMaterialProvider;

  constructor(basePath: string, fetchImpl: typeof fetch = fetch) {
    super();
    this.keys = new FetchKeyMaterialProvider(basePath, fetchImpl);
  }

  async getZKIR(circuitId: string): Promise<ZKIR> {
    return (await this.keys.getZKIR(circuitId)) as ZKIR;
  }

  async getProverKey(circuitId: string): Promise<ProverKey> {
    return (await this.keys.getProverKey(circuitId)) as ProverKey;
  }

  async getVerifierKey(circuitId: string): Promise<VerifierKey> {
    return (await this.keys.getVerifierKey(circuitId)) as VerifierKey;
  }
}
