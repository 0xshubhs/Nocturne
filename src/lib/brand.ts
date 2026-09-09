// Nocturne — the one place the product is named.
//
// Centralised so a rename is a single edit rather than a sweep through 60
// files. (It has already been one sweep; there will not be a second.)

export const BRAND = {
  name: "Nocturne",
  /** Lowercase form for URLs, ids and anywhere a wordmark would look shouty. */
  slug: "nocturne",
  tagline: "Private credit on Midnight",
  /** One line, for a landing hero. */
  promise: "Borrow against a credit score no one can read.",
  /** Two sentences, for a meta description or a judge skimming the README. */
  summary:
    "Nocturne turns private financial attestations into a zero-knowledge credit score, " +
    "then proves a single bit about it — that it clears a tier — so you can borrow " +
    "under-collateralized without revealing who you are or what you have.",
} as const;
