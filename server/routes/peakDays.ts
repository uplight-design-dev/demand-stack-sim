import { Router } from "express";
import { z } from "zod";
import type { ApiEnvelope, NormalizedEnergyRecord } from "../../shared/types/energy.js";
import { BA_BY_ID } from "../lib/geo/balancingAuthorities.js";
import { selectAdapter, demoAdapter } from "../lib/adapters/registry.js";
import { DEMO_META } from "../lib/demoData.js";
import { fillLocalTimestamps, groupByLocalDate } from "../lib/loadProfile.js";
import { checkHourlyQuality } from "../lib/quality/validate.js";

export const peakDaysRouter = Router();

const querySchema = z.object({
  region: z.string().min(1),
  year: z.string().regex(/^\d{4}$/),
  season: z.enum(["summer", "winter", "all"]).optional()
});

peakDaysRouter.get("/peak-days", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }
  const { region, year } = parsed.data;
  const season = parsed.data.season ?? "all";

  const { adapter, reason } = selectAdapter();
  const isDemo = adapter.sourceName === "DEMO";
  const regionId = isDemo ? DEMO_META.regionId : region.toUpperCase();
  const baInfo = isDemo ? undefined : BA_BY_ID[regionId];
  if (!isDemo && !baInfo) {
    res.status(404).json({ error: "unknown_region", region: regionId });
    return;
  }
  const regionName = isDemo ? DEMO_META.regionName : baInfo!.name;
  const timezone = isDemo ? DEMO_META.timezone : baInfo!.timezone;

  let records: NormalizedEnergyRecord[] = [];
  let usedDemoFallback = isDemo;
  try {
    const result = await adapter.fetchHourlyDemand({
      regionId,
      regionName,
      timezone,
      startUtc: `${year}-01-01`,
      endUtc: `${year}-12-31`,
      metric: "actual_demand"
    });
    records = fillLocalTimestamps(result.records, timezone);
  } catch (err) {
    const demoResult = await demoAdapter.fetchHourlyDemand({
      regionId: DEMO_META.regionId,
      regionName: DEMO_META.regionName,
      timezone: DEMO_META.timezone,
      startUtc: `${year}-01-01`,
      endUtc: `${year}-12-31`,
      metric: "actual_demand"
    });
    records = demoResult.records;
    usedDemoFallback = true;
    void err;
  }

  const { cleaned, quality } = checkHourlyQuality(records);
  const byDate = groupByLocalDate(cleaned, timezone);

  const monthly: { month: number; date: string; peakMw: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    let best: { date: string; peakMw: number } | null = null;
    for (const [date, recs] of byDate) {
      if (Number(date.slice(5, 7)) !== m) continue;
      const max = Math.max(...recs.map((r) => r.value));
      if (!best || max > best.peakMw) best = { date, peakMw: max };
    }
    if (best) monthly.push({ month: m, ...best });
  }

  const seasonMonths = season === "summer" ? [6, 7, 8] : season === "winter" ? [12, 1, 2] : monthly.map((m) => m.month);
  const seasonal = monthly.filter((m) => seasonMonths.includes(m.month)).sort((a, b) => b.peakMw - a.peakMw);
  const annualPeak = monthly.reduce((best, m) => (!best || m.peakMw > best.peakMw ? m : best), null as (typeof monthly)[number] | null);

  const envelope: ApiEnvelope<{ annualPeak: typeof annualPeak; monthly: typeof monthly; seasonal: typeof seasonal }> = {
    data: { annualPeak, monthly, seasonal },
    summary: { year, season, monthsWithData: monthly.length },
    provenance: {
      source: usedDemoFallback ? "Demonstration data" : "U.S. Energy Information Administration (EIA)",
      dataset: usedDemoFallback ? "Synthetic hourly demand (not from EIA)" : "electricity/rto/region-data (Form EIA-930)",
      sourceUrl: "https://www.eia.gov/opendata/browser/electricity/rto/region-data",
      retrievedAt: new Date().toISOString()
    },
    quality: {
      status: usedDemoFallback ? "demonstration" : quality.status,
      flags: usedDemoFallback && reason ? [...quality.flags, reason] : quality.flags
    },
    cache: { status: "miss" }
  };

  res.json(envelope);
});
