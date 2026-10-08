import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Two package-lock.json files exist (this project's and one in the parent
  // home directory), so Next/Turbopack otherwise infers the wrong workspace
  // root and, in dev, fails to register nested API route handlers that live
  // beside a sibling route.ts (e.g. /api/orders/[id]/deliver → 404).
  turbopack: { root: path.resolve(__dirname) },
  // Self-contained server bundle (.next/standalone) — this is what the
  // Electron desktop build spawns as its backend, so it doesn't need the
  // full node_modules tree shipped alongside it.
  output: "standalone",
  // The SQL migrations are read from disk at startup (src/db/index.ts), so
  // they must ship inside the standalone server bundle.
  outputFileTracingIncludes: {
    "/api/**/*": ["./drizzle/**/*"],
  },
  // Never bake a local database or old JSON store into the bundle.
  outputFileTracingExcludes: {
    "*": [".offline-data.json", "*.db", "*.db-wal", "*.db-shm"],
  },
};

export default nextConfig;
