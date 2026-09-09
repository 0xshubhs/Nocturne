import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // WebCrypto (crypto.subtle) is on the Node global; no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
