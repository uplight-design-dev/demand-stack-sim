import { Router } from "express";
import { z } from "zod";
import type { ApiEnvelope, EnergyMetric, LoadProfile, ProfileType } from "../../shared/types/energy.js";
import { BA_BY_ID } from "../lib/geo/balancingAuthorities.js";
import { selectAdapter, demoAdapter } from "../lib/adapters/registry.js";
import { buildCacheKey, FileCache } from "../lib/cache.js";
import { ENV } from "../env.js";
import { checkHourlyQuality } from "../lib/quality/validate.js";
import {
  buildCustomDateProfile,
  buildDateRangeAverageProfile,
  buildPeakDayProfile,
  buildTypicalWeekdayProfile,
  fillLocalTimestamps
} from "../lib/loadProfile.js";
import { DEMO_META } from "../lib/demoData.js";
import { UpstreamError } from "../lib/httpClient.js";
import type { NormalizedEnergyRecord } from "../../shared/types/energy.js";

export const loadProfileRouter = Router();
const cache = new FileCache(ENV.CACHE_DIR);
const TTL_MS = 6 * 60 * 60 * 1000; // historical hourly data is immutable once posted; 6h is conservative

const profileTypes: [ProfileType, ...ProfileType[]] = [
  "peak_day",
  "typical_summer_weekday",
  "typical_winter_weekday",
  "custom_date",
  "date_range_average"
];

const querySchema = z.object({
  region: z.string().min(1),
  profileType: z.enum(profileTypes),
  metric: z.enum(["actual_demand", "forecast_demand"]).optional(),
  year: z.string().regex(/^\d{4}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

loadProfileRouter.get("/load-profile", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const { region, profileType, year, date, start, end } = parsed.data;
  const metric: EnergyMetric = parsed.data.metric ?? "actual_demand";

  if (profileType === "custom_date" && !date) {
    res.status(400).json({ error: "invalid_request", details: "date is required for profileType=custom_date" });
    return;
  }
  if (profileType === "date_range_average" && (!start || !end)) {
    res.status(400).json({ error: "invalid_request", details: "start and end are required for profileType=date_range_average" });
    return;
  }

  const { adapter, reason } = selectAdapter();
  const isDemo = adapter.sourceName === "DEMO";
  let usedDemoFallback = isDemo;
  const regionId = isDemo ? DEMO_META.regionId : region.toUpperCase();
  const baInfo = isDemo ? undefined : BA_BY_ID[regionId];
  if (!isDemo && !baInfo) {
    res.status(404).json({ error: "unknown_region", region: regionId });
    return;
  }
  const regionName = isDemo ? DEMO_META.regionName : baInfo!.name;
  const timezone = isDemo ? DEMO_META.timezone : baInfo!.timezone;

  const effectiveYear = year ?? String(new Date().getFullYear() - 1);
  const fetchWindow = resolveFetchWindow(profileType, effectiveYear, date, start, end);

  const cacheKey = buildCacheKey("load-profile", {
    region: regionId,
    metric,
    source: adapter.sourceName,
    start: fetchWindow.start,
    end: fetchWindow.end
  });

  let records: NormalizedEnergyRecord[];
  let cacheStatus: "fresh" | "stale" | "miss" = "miss";
  let effectiveSourceUrl = "";
  let effectiveRetrievedAt = new Date().toISOString();
  const qualityFlags: string[] = [];

  const cached = await cache.get<NormalizedEnergyRecord[]>(cacheKey);
  if (cached.status === "fresh" && cached.entry) {
    records = cached.entry.value;
    cacheStatus = "fresh";
    effectiveRetrievedAt = cached.entry.retrievedAt;
  } else {
    try {
      const result = await adapter.fetchHourlyDemand({
        regionId,
        regionName,
        timezone,
        startUtc: fetchWindow.start,
        endUtc: fetchWindow.end,
        metric
      });
      records = fillLocalTimestamps(result.records, timezone);
      effectiveSourceUrl = result.provenance.sourceUrl;
      effectiveRetrievedAt = result.provenance.retrievedAt;
      await cache.set(cacheKey, records, TTL_MS, { region: regionId, start: fetchWindow.start, end: fetchWindow.end }, cacheKey);
      cacheStatus = cached.status === "stale" ? "stale" : "miss";
    } catch (err) {
      if (cached.status === "stale" && cached.entry) {
        records = cached.entry.value;
        cacheStatus = "stale";
        qualityFlags.push("eia_unavailable_serving_stale_cache");
      } else {
        const demoResult = await demoAdapter.fetchHourlyDemand({
          regionId: DEMO_META.regionId,
          regionName: DEMO_META.regionName,
          timezone: DEMO_META.timezone,
          startUtc: fetchWindow.start,
          endUtc: fetchWindow.end,
          metric
        });
        records = demoResult.records;
        usedDemoFallback = true;
        qualityFlags.push(err instanceof UpstreamError ? `eia_unavailable: ${err.message}` : "eia_unavailable");
      }
    }
  }

  const { cleaned, quality } = checkHourlyQuality(records);
  quality.flags.push(...qualityFlags);

  const profile = buildProfile(cleaned, timezone, profileType, regionId, regionName, metric, { year: effectiveYear, date, start, end });

  const envelope: ApiEnvelope<LoadProfile> = {
    data: profile,
    summary: profile.summary,
    provenance: {
      source: usedDemoFallback ? "Demonstration data" : "U.S. Energy Information Administration (EIA)",
      dataset: usedDemoFallback ? "Synthetic hourly demand (not from EIA)" : "electricity/rto/region-data (Form EIA-930)",
      sourceUrl:
        effectiveSourceUrl ||
        (usedDemoFallback ? DEMO_META.sourceUrl : "https://www.eia.gov/opendata/browser/electricity/rto/region-data"),
      retrievedAt: effectiveRetrievedAt
    },
    quality: {
      status: usedDemoFallback ? "demonstration" : quality.status,
      flags: usedDemoFallback && reason ? [...quality.flags, reason] : quality.flags
    },
    cache: { status: cacheStatus }
  };

  res.json(envelope);
});

// Buffer of 2 UTC days on each side of the requested local date(s). A local
// calendar day, translated to UTC, can spill up to ~10 hours into the
// adjacent UTC day for US timezones (as far west as Hawaii-Aleutian); a
// 1-day buffer is not always enough to fully cover the *end* of the local
// day when the zone is behind UTC, which silently truncated the last few
// hours of the day -- 2 days on each side comfortably covers every US zone.
function resolveFetchWindow(
  profileType: ProfileType,
  year: string,
  date?: string,
  start?: string,
  end?: string
): { start: string; end: string } {
  if (profileType === "custom_date" && date) {
    return { start: shiftDate(date, -2), end: shiftDate(date, 2) };
  }
  if (profileType === "date_range_average" && start && end) {
    return { start: shiftDate(start, -2), end: shiftDate(end, 2) };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function buildProfile(
  records: NormalizedEnergyRecord[],
  timezone: string,
  profileType: ProfileType,
  regionId: string,
  regionName: string,
  metric: EnergyMetric,
  opts: { year: string; date?: string; start?: string; end?: string }
): LoadProfile {
  switch (profileType) {
    case "custom_date":
      return buildCustomDateProfile(records, timezone, opts.date!, regionId, regionName, metric);
    case "date_range_average":
      return buildDateRangeAverageProfile(records, timezone, regionId, regionName, metric, opts.start!, opts.end!);
    case "typical_summer_weekday":
      return buildTypicalWeekdayProfile(records, timezone, regionId, regionName, metric, "summer");
    case "typical_winter_weekday":
      return buildTypicalWeekdayProfile(records, timezone, regionId, regionName, metric, "winter");
    case "peak_day":
    default:
      return buildPeakDayProfile(records, timezone, regionId, regionName, metric);
  }
}
