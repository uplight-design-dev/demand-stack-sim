import { Router } from "express";
import { ENV, hasEiaKey } from "../env.js";
import { selectAdapter } from "../lib/adapters/registry.js";

/**
 * Development-only diagnostics. Mounted only when NODE_ENV !== "production"
 * (see server/index.ts). Never exposes the API key -- only whether one is
 * configured -- and never runs in the public production build.
 */
export const diagnosticsRouter = Router();

diagnosticsRouter.get("/diagnostics", (_req, res) => {
  const { adapter, fellBackToDemo, reason } = selectAdapter();
  res.json({
    env: ENV.NODE_ENV,
    activeAdapter: adapter.sourceName,
    configuredAdapter: ENV.ENERGY_DATA_ADAPTER,
    apiKeyConfigured: hasEiaKey(),
    fellBackToDemo,
    fallbackReason: reason ?? null,
    cacheDir: ENV.CACHE_DIR,
    note: "Development diagnostics only. Never mounted in production. API key value is never exposed here."
  });
});
