import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@takween/contracts"],
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;
