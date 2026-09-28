// Single place that reads process.env. EIA_API_KEY is read ONLY here and
// ONLY ever used server-side (passed into EiaDataAdapter's constructor) --
// it must never be serialized into an API response, a log line, an export,
// or any client bundle.
import { config as loadEnvFile } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local (preferred, git-ignored -- see README "Quickstart") and
// fall back to .env, if present, from the current working directory (npm
// scripts always run from the project root). dotenv.config() never
// overwrites a key already set in process.env, so a real OS/CI-level env
// var still wins over either file, and .env.local (loaded first) wins over
// .env. Without this, EIA_API_KEY pasted into .env.local was never actually
// read -- process.env.EIA_API_KEY stayed empty and the app silently fell
// back to demonstration data with no error, confirmed via live testing.
//
// Skipped under Vitest (which sets process.env.VITEST): tests must stay
// hermetic and not depend on whichever .env.local happens to exist on the
// machine running them -- server/index.test.ts explicitly deletes
// EIA_API_KEY to exercise the no-key/demo-fallback path, and that should
// hold regardless of local developer configuration.
if (!process.env.VITEST) {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      loadEnvFile({ path });
    }
  }
}

export const ENV = {
  EIA_API_KEY: process.env.EIA_API_KEY ?? "",
  // OpenEI Utility Rate Database (URDB) key -- same server-side-only rule as
  // EIA_API_KEY: read only here, only ever passed into UrdbDataAdapter's
  // constructor, never serialized into a response, log line, export, or
  // client bundle.
  OPENEI_API_KEY: process.env.OPENEI_API_KEY ?? "",
  ENERGY_DATA_ADAPTER: (process.env.ENERGY_DATA_ADAPTER ?? "eia") as "eia" | "demo",
  PORT: Number(process.env.PORT ?? 8787),
  // Vercel's serverless functions have a read-only filesystem except /tmp
  // (process.env.VERCEL is set to "1" there automatically, both at build
  // and at runtime) -- FileCache's default ".cache/energy" would throw on
  // every write there. /tmp is also wiped between cold starts on Vercel, so
  // this is a plain per-instance cache there, not a durable one; that's
  // fine for FileCache's job (avoiding redundant upstream calls within one
  // warm instance), same spirit as the Postgres/Redis swap called out in
  // cache.ts for a real production deployment.
  CACHE_DIR: process.env.CACHE_DIR ?? (process.env.VERCEL ? "/tmp/dss-cache" : ".cache/energy"),
  NODE_ENV: process.env.NODE_ENV ?? "development"
};

export function hasEiaKey(): boolean {
  return ENV.EIA_API_KEY.trim().length > 0;
}

export function hasOpenEiKey(): boolean {
  return ENV.OPENEI_API_KEY.trim().length > 0;
}
