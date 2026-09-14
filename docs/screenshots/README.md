# Screenshots

Captured from the running app (`npm run dev`) at 1440×900, 2× device scale —
so each file is 2880×1800 and stays sharp on a retina display or a projector.
JPEG, quality 88.

Regenerate by running the app and driving it with Playwright against
`http://localhost:3000`; the persona toggle lives in React state rather than the
URL, so switching from Alice to Bob needs a real click.

| File | What it shows | Use it for |
|---|---|---|
| `01-landing.jpg` | The pitch: *"Borrow against a credit score no one can read."* | Gallery cover |
| `02-same-collateral-3x.jpg` | **Same collateral, three times the loan** — tier 0 at 50% vs tier 1 at 150%, beside the chain-sees/you-know table with the private fields redacted | The single strongest image |
| `03-borrow-alice.jpg` | Alice: attestations with weights, score **1210** *"visible only here"*, a lender learns only **750+**, borrowing **1500** against 1000 | The privacy claim, concretely |
| `04-borrow-bob.jpg` | Bob: score **500**, band **500–749**, tier 1 greyed out, borrowing **500** against the same 1000 | Pair with 03 — that is the 3× |
| `05-pool.jpg` | Lender side: liquidity, tier rules, the loan book | Shows both sides of the market |
| `06-explorer.jpg` | Public ledger vs the device's private state, with `identity`, `creditScore`, `attestationValues` and `linkedWallets` marked **not in the ledger** | The whole argument in one screen |

## Notes for a submission gallery

- The gallery caps at 5 images. `02`, `03`, `04`, `06` are the load-bearing
  ones; `01` if a cover is wanted, `05` if there is room.
- `03` and `04` are framed identically on purpose — side by side, the only
  things that change are the score, the band and the amount.
- Every number is read back from real ledger state, not mocked up. The score
  values differ from the persona comments in `src/lib/demo/personas.ts`
  because those assume the cross-chain wallet has already been linked; in these
  shots it has not, so the cross-chain attestation contributes 0.
