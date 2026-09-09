// JSON codec that survives `bigint` and `Uint8Array` — the two types that show
// up all over Midnight private state (identity secrets, attestation values,
// Merkle material). Used by the encrypted private-state store.

type Tagged =
  | { __t: "bigint"; v: string }
  | { __t: "u8"; v: string }; // base64

const B64 = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
  },
  decode(b64: string): Uint8Array {
    const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { __t: "bigint", v: value.toString() } satisfies Tagged;
  if (value instanceof Uint8Array) return { __t: "u8", v: B64.encode(value) } satisfies Tagged;
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && "__t" in value) {
    const t = value as Tagged;
    if (t.__t === "bigint") return BigInt(t.v);
    if (t.__t === "u8") return B64.decode(t.v);
  }
  return value;
}

export function encode(state: unknown): string {
  return JSON.stringify(state, replacer);
}

export function decode<T>(json: string): T {
  return JSON.parse(json, reviver) as T;
}
