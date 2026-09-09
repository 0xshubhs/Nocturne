import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `@defi1/contracts` ships TypeScript source plus the Compact compiler's
  // generated bindings, so Next has to transpile it rather than treat it as a
  // prebuilt dependency.
  transpilePackages: ["@defi1/contracts"],
};

export default nextConfig;
