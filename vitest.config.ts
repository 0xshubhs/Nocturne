import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` -> `./src/*` path alias from tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // WebCrypto (crypto.subtle) is on the Node global; no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `prove-live` needs a running proof server (Docker), so `npm test` skips
    // it and `npm run test:prove` opts in. An unconditional `exclude` would
    // win even against an explicit filename filter, hence the env flag.
    exclude:
      process.env.PROVE_LIVE === "1"
        ? ["**/node_modules/**"]
        : ["**/node_modules/**", "src/lib/midnight/prove-live.test.ts"],
  },
});
