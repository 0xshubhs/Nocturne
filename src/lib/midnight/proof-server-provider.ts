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

/** Node, and not a bundled browser build. */
const IS_NODE =
  typeof process !== "undefined" &&
  process.versions?.node != null &&
  typeof (globalThis as { window?: unknown }).window === "undefined";

type RawResponse = { status: number; ok: boolean; body: Uint8Array };

/**
 * POST over `node:http` instead of `fetch`.
 *
 * Node's `fetch` is undici, whose `headersTimeout` defaults to **300 s**. A
 * real `borrow` or `proveReputation` can exceed that, and when it does undici
 * aborts with a bare `fetch failed` that looks like the server is unreachable
 * — while the server is in fact still computing. Worse, the abandoned request
 * leaves a worker pinned, so every later request queues behind it and the
 * whole server appears to hang.
 *
 * `AbortController` alone does not help: undici's timer fires first. There is
 * no way to raise it without an undici `Agent`, and undici is not a dependency
 * here — so on Node we use the core HTTP client, which imposes no such limit,
 * and let `timeoutMs` be the only deadline.
 */
async function nodePost(
  url: string,
  body: Uint8Array,
  timeoutMs: number,
): Promise<RawResponse> {
  const { request } = await import(url.startsWith("https:") ? "node:https" : "node:http");
  return new Promise<RawResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(body.byteLength),
        },
      },
      (res: import("node:http").IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("error", reject);
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            body: new Uint8Array(Buffer.concat(chunks)),
          });
        });
      },
    );
    // Our deadline, not undici's. Generous by design: proving cannot resume.
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`no response within ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end(Buffer.from(body));
  });
}

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
      // On Node, go around undici's 300s headersTimeout (see `nodePost`).
      // A caller-supplied `fetchImpl` always wins — tests stub that seam.
      if (IS_NODE && !opts.fetchImpl) {
        const res = await nodePost(`${base}${path}`, body, timeoutMs);
        if (!res.ok) {
          const detail = Buffer.from(res.body).toString("utf8");
          throw new ProofServerError(
            `proof server ${path} failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
            res.status,
          );
        }
        return res.body;
      }

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
