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
    // `prove-live` needs a running proof server (Docker). Run it deliberately
    // with `npm run test:prove` rather than surprising `npm test` with it.
    exclude: ["**/node_modules/**", "src/lib/midnight/prove-live.test.ts"],
  },
});
