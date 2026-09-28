import { Router } from "express";
import { z } from "zod";
import type { ApiEnvelope } from "../../shared/types/energy.js";
import type { UtilityRateOptions } from "../../shared/types/rates.js";
import { STATE_BY_ABBR } from "../lib/geo/states.js";
import { defaultUtilityForState } from "../lib/geo/utilities.js";
import { selectRateAdapter, rateDemoAdapter } from "../lib/adapters/rateRegistry.js";
import { buildCacheKey, FileCache } from "../lib/cache.js";
import { ENV } from "../env.js";
import { UpstreamError } from "../lib/httpClient.js";

export const rateSchedulesRouter = Router();
const cache = new FileCache(ENV.CACHE_DIR);
// Rate tariffs change infrequently (typically annually, occasionally
// mid-year for a rider adjustment) -- a week-long cache keeps this well
// within URDB's usage expectations without serving meaningfully stale data.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const querySchema = z.object({
  state: z.string().length(2),
  sector: z.enum(["Residential", "Commercial", "Industrial"]).optional()
});

rateSchedulesRouter.get("/rate-schedules", async (req, res) => {
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
  const sector = parsed.data.sector ?? "Residential";

  const utility = defaultUtilityForState(stateAbbr);
  if (!utility) {
    // Never fabricate a utility mapping for a state we haven't curated --
    // same discipline as regionRegistry.ts's "not_yet_mapped" coverage.
    res.json(
      makeEnvelope(
        {
          utilityName: "",
          eiaid: 0,
          state: stateAbbr,
          sector,
          defaultSchedule: null,
          alternativeSchedules: [],
          qualityFlags: ["utility_not_yet_mapped_for_state"]
        },
        { source: "Not available", dataset: "No curated utility mapping for this state", sourceUrl: "", retrievedAt: new Date().toISOString() },
        "miss"
      )
    );
    return;
  }

  const { adapter, fellBackToDemo, reason } = selectRateAdapter();
  const cacheKey = buildCacheKey("rate-schedules", { state: stateAbbr, sector, eiaid: utility.eiaid, source: adapter.sourceName });
  const cached = await cache.get<UtilityRateOptions>(cacheKey);

  if (cached.status === "fresh" && cached.entry) {
    res.json(makeEnvelope(cached.entry.value, undefined, "fresh"));
    return;
  }

  try {
    const result = await adapter.fetchUtilityRates({
      eiaid: utility.eiaid,
      utilityName: utility.name,
      state: stateAbbr,
      sector
    });
    await cache.set(cacheKey, result.data, TTL_MS, { state: stateAbbr, sector }, cacheKey);
    const envelope = makeEnvelope(result.data, result.provenance, cached.status === "stale" ? "stale" : "miss");
    if (fellBackToDemo && reason) envelope.quality.flags.push(reason);
    res.json(envelope);
  } catch (err) {
    if (cached.status === "stale" && cached.entry) {
      const envelope = makeEnvelope(cached.entry.value, undefined, "stale");
      envelope.quality.status = "stale";
      envelope.quality.flags.push("urdb_unavailable_serving_stale_cache");
      res.json(envelope);
      return;
    }
    const demo = await rateDemoAdapter.fetchUtilityRates({
      eiaid: utility.eiaid,
      utilityName: utility.name,
      state: stateAbbr,
      sector
    });
    const envelope = makeEnvelope(demo.data, demo.provenance, "miss");
    envelope.quality.status = "demonstration";
    envelope.quality.flags.push(err instanceof UpstreamError ? `urdb_unavailable: ${err.message}` : "urdb_unavailable");
    res.json(envelope);
  }
});

function makeEnvelope(
  data: UtilityRateOptions,
  provenance: ApiEnvelope<UtilityRateOptions>["provenance"] | undefined,
  cacheStatus: "fresh" | "stale" | "miss"
): ApiEnvelope<UtilityRateOptions> {
  const isDemo = data.qualityFlags.includes("demonstration_data");
  return {
    data,
    summary: {
      state: data.state,
      hasDefaultSchedule: data.defaultSchedule !== null,
      alternativeCount: data.alternativeSchedules.length
    },
    provenance:
      provenance ?? {
        source: isDemo ? "Demonstration data (frozen real URDB snapshot)" : "OpenEI Utility Rate Database (URDB)",
        dataset: `Utility rate schedules (eiaid ${data.eiaid}, sector ${data.sector})`,
        sourceUrl: "https://apps.openei.org/USURDB/",
        retrievedAt: new Date().toISOString()
      },
    quality: {
      status: isDemo ? "demonstration" : data.defaultSchedule || data.alternativeSchedules.length > 0 ? "complete" : "unavailable",
      flags: [...data.qualityFlags]
    },
    cache: { status: cacheStatus }
  };
}
