import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@nocturne/contracts` ships TypeScript source plus the Compact compiler's
  // generated bindings, so Next has to transpile it rather than treat it as a
  // prebuilt dependency.
  transpilePackages: ["@nocturne/contracts"],
};

export default nextConfig;
