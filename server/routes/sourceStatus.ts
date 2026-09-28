import { Router } from "express";
import { z } from "zod";
import type { ApiEnvelope } from "../../shared/types/energy.js";
import { selectAdapter } from "../lib/adapters/registry.js";
import { selectRateAdapter } from "../lib/adapters/rateRegistry.js";
import { hasEiaKey, hasOpenEiKey, ENV } from "../env.js";
import { REGION_REGISTRY_BY_STATE } from "../lib/geo/regionRegistry.js";

export const sourceStatusRouter = Router();

const querySchema = z.object({ region: z.string().optional() });

sourceStatusRouter.get("/source-status", (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  const region = parsed.success ? parsed.data.region : undefined;
  const { adapter, fellBackToDemo, reason } = selectAdapter();
  // Separate data source (EIA load data) from the rate-schedule source
  // (OpenEI URDB) -- these are two independent API keys/adapters and can be
  // in different live/demo states at the same time (see rateRegistry.ts).
  const rateSelection = selectRateAdapter();

  const data = {
    activeAdapter: adapter.sourceName,
    configuredAdapter: ENV.ENERGY_DATA_ADAPTER,
    apiKeyConfigured: hasEiaKey(),
    fellBackToDemo,
    fallbackReason: reason ?? null,
    region: region ?? null,
    regionCoverage: region ? REGION_REGISTRY_BY_STATE[region.toUpperCase()]?.coverage ?? null : null,
    rates: {
      activeAdapter: rateSelection.adapter.sourceName,
      apiKeyConfigured: hasOpenEiKey(),
      fellBackToDemo: rateSelection.fellBackToDemo,
      fallbackReason: rateSelection.reason ?? null
    }
  };

  const envelope: ApiEnvelope<typeof data> = {
    data,
    summary: { status: fellBackToDemo ? "demonstration" : "live" },
    provenance: {
      source: "This application",
      dataset: "Adapter/source status",
      sourceUrl: "https://www.eia.gov/opendata/",
      retrievedAt: new Date().toISOString()
    },
    quality: { status: fellBackToDemo ? "demonstration" : "complete", flags: [] },
    cache: { status: "fresh" }
  };

  res.json(envelope);
});
