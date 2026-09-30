import type { NextConfig } from "next";

// The root `.env` is not loaded here. Next compiles this file to CommonJS and resolves it outside
// the workspace graph, so it cannot import the backend's loader. It does not need to: a run is
// spawned as `tsx scripts/fleet.ts`, which calls loadEnv() itself, and that is the only place a
// hosted engine's key is used. Next still loads `frontend/.env` on its own for anything the
// interface needs directly.

const nextConfig: NextConfig = {
  // The store is a native module read on the server; bundling it would break the binding.
  serverExternalPackages: ["better-sqlite3"],
  // The floating dev-mode badge sits over the sidebar; build and runtime errors still surface.
  devIndicators: false,
};

export default nextConfig;
