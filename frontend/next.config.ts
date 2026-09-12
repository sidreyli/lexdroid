import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The store is a native module read on the server; bundling it would break the binding.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
