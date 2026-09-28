import { Router } from "express";
import { z } from "zod";
import type { ApiEnvelope, StateOverview } from "../../shared/types/energy.js";
import { STATE_BY_ABBR } from "../lib/geo/states.js";
import { selectAdapter, demoAdapter } from "../lib/adapters/registry.js";
import { buildCacheKey, FileCache } from "../lib/cache.js";
import { ENV } from "../env.js";
import { UpstreamError } from "../lib/httpClient.js";

export const stateOverviewRouter = Router();
const cache = new FileCache(ENV.CACHE_DIR);
const TTL_MS = 24 * 60 * 60 * 1000; // state-level annual data changes rarely; cache a day

const querySchema = z.object({
  state: z.string().length(2),
  year: z.string().regex(/^\d{4}$/).optional()
});

stateOverviewRouter.get("/state-overview", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const stateAbbr = parsed.data.state.toUpperCase();
  const stateInfo = STATE_BY_ABBR[stateAbbr];
  if (!stateInfo) {
    res.status(404).json({ error: "unknown_state", state: stateAbbr });
    return;
  }
  const year = parsed.data.year ?? String(new Date().getFullYear() - 1);

  const { adapter, fellBackToDemo, reason } = selectAdapter();
  const cacheKey = buildCacheKey("state-overview", { state: stateAbbr, year, source: adapter.sourceName });
  const cached = await cache.get<StateOverview>(cacheKey);

  if (cached.status === "fresh" && cached.entry) {
    res.json(makeEnvelope(cached.entry.value, "fresh"));
    return;
  }

  try {
    const overview = await adapter.fetchStateOverview(stateAbbr, stateInfo.name, year);
    await cache.set(cacheKey, overview, TTL_MS, { state: stateAbbr, year }, cacheKey);
    const envelope = makeEnvelope(overview, cached.status === "stale" ? "stale" : "miss");
    if (fellBackToDemo && reason) envelope.quality.flags.push(reason);
    res.json(envelope);
  } catch (err) {
    if (cached.status === "stale" && cached.entry) {
      const envelope = makeEnvelope(cached.entry.value, "stale");
      envelope.quality.status = "stale";
      envelope.quality.flags.push("eia_unavailable_serving_stale_cache");
      res.json(envelope);
      return;
    }
    // Fall back to demo so the UI never dead-ends on an EIA outage.
    const demo = await demoAdapter.fetchStateOverview(stateAbbr, stateInfo.name, year);
    const envelope = makeEnvelope(demo, "miss");
    envelope.quality.status = "demonstration";
    envelope.quality.flags.push(
      err instanceof UpstreamError ? `eia_unavailable: ${err.message}` : "eia_unavailable"
    );
    res.json(envelope);
  }
});

function makeEnvelope(overview: StateOverview, cacheStatus: "fresh" | "stale" | "miss"): ApiEnvelope<StateOverview> {
  return {
    data: overview,
    summary: {
      metricCount: overview.metrics.length,
      state: overview.state
    },
    provenance: overview.provenance,
    quality: { status: overview.quality.status, flags: [...overview.quality.flags] },
    cache: { status: cacheStatus }
  };
}
