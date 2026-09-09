// Nocturne — proving against a standalone proof server.
//
// The wallet is the proving path a user takes (`getProvingProvider` in
// `tx-assembler.ts`), and it is the right one: the user's keys and proving
// preferences stay in the wallet. This is the other one — a `ProvingProvider`
// backed by a self-hosted `midnight-proof-server`.
//
// It exists for two reasons:
//
//   · It is testable. There is no headless wallet for this stack, so without
//     it the single most expensive step in the pipeline could only ever be
//     exercised by a human clicking through a browser extension.
//   · It is a fallback for a wallet that does not implement
//     `getProvingProvider`, and for server-side or scripted flows (a deploy
//     from CI, say) where no wallet exists at all.
//
// The payload format is not ours to invent: `createProvingPayload` and
// `createCheckPayload` come from the ledger, so this stays correct as the
// server's protocol moves.

import {
  createCheckPayload,
  createProvingPayload,
  parseCheckResult,
  type ProvingKeyMaterial,
  type ProvingProvider,
} from "@midnightntwrk/ledger-v9";

export class ProofServerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProofServerError";
  }
}

/** Resolves the artifacts for a key location; `HttpZKConfigProvider` satisfies it. */
export interface KeyMaterialSource {
  getProverKey(keyLocation: string): Promise<Uint8Array>;
  getVerifierKey(keyLocation: string): Promise<Uint8Array>;
  getZKIR(keyLocation: string): Promise<Uint8Array>;
}

async function keyMaterialFor(
  source: KeyMaterialSource,
  keyLocation: string,
): Promise<ProvingKeyMaterial | undefined> {
  try {
    const [proverKey, verifierKey, ir] = await Promise.all([
      source.getProverKey(keyLocation),
      source.getVerifierKey(keyLocation),
      source.getZKIR(keyLocation),
    ]);
    return { proverKey, verifierKey, ir };
  } catch {
    // `undefined` is the ledger's "no key material here", which is the honest
    // answer for a location we hold no artifacts for.
    return undefined;
  }
}

export type ProofServerOptions = {
  /** Base URL, e.g. `http://127.0.0.1:6300`. */
  url: string;
  keyMaterial: KeyMaterialSource;
  fetchImpl?: typeof fetch;
  /**
   * Proving a real circuit takes seconds to minutes. The default is generous
   * on purpose — a timeout here throws away work that cannot be resumed.
   */
  timeoutMs?: number;
};

/**
 * A `ProvingProvider` that delegates to a running proof server.
 *
 * Shape-compatible with the one the wallet hands back, so `tx-assembler`'s
 * `prove` accepts either.
 */
export function proofServerProvingProvider(opts: ProofServerOptions): ProvingProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const base = opts.url.replace(/\/+$/, "");

  async function post(path: string, body: Uint8Array): Promise<Uint8Array> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: body as unknown as BodyInit,
        signal: controller.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new ProofServerError(
          `proof server ${path} failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
          res.status,
        );
      }
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (err instanceof ProofServerError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new ProofServerError(`proof server did not respond within ${timeoutMs}ms`);
      }
      throw new ProofServerError(
        `could not reach the proof server at ${base}: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async prove(serializedPreimage, keyLocation, overwriteBindingInput) {
      const material = await keyMaterialFor(opts.keyMaterial, keyLocation);
      const payload = createProvingPayload(serializedPreimage, overwriteBindingInput, material);
      return post("/prove", payload);
    },

    async check(serializedPreimage, keyLocation) {
      const material = await keyMaterialFor(opts.keyMaterial, keyLocation);
      const payload = createCheckPayload(serializedPreimage, material?.ir);
      const raw = await post("/check", payload);
      // The response is a tagged binary envelope ("midnight:vec(option(u64)):"),
      // not JSON. The ledger owns that format, so let it do the parsing.
      try {
        return parseCheckResult(raw);
      } catch (err) {
        throw new ProofServerError(
          `could not parse the proof server's check result (${raw.length} bytes): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    },

    async lookupKey(keyLocation) {
      return keyMaterialFor(opts.keyMaterial, keyLocation);
    },
  };
}

/** Is a proof server reachable and healthy at this URL? */
export async function proofServerVersion(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, "")}/version`);
    if (!res.ok) return null;
    return (await res.text()).trim();
  } catch {
    return null;
  }
}
