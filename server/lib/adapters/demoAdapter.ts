import type { EnergyDataAdapter, AdapterFetchResult, FetchHourlyParams } from "./types.js";
import type { NormalizedEnergyRecord, StateOverview } from "../../../shared/types/energy.js";
import { generateDemoYear, DEMO_META } from "../demoData.js";

const yearCache = new Map<number, NormalizedEnergyRecord[]>();

function yearRecords(year: number): NormalizedEnergyRecord[] {
  let recs = yearCache.get(year);
  if (!recs) {
    recs = generateDemoYear(year);
    yearCache.set(year, recs);
  }
  return recs;
}

export class DemoDataAdapter implements EnergyDataAdapter {
  readonly sourceName = "DEMO" as const;

  async fetchHourlyDemand(params: FetchHourlyParams): Promise<AdapterFetchResult<NormalizedEnergyRecord>> {
    const start = new Date(normalizeDateInput(params.startUtc));
    const end = new Date(normalizeDateInput(params.endUtc));
    const years = new Set([start.getUTCFullYear(), end.getUTCFullYear()]);
    const all = Array.from(years).flatMap((y) => yearRecords(y));
    const records = all.filter((r) => {
      const t = new Date(r.timestampUtc).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
    return {
      records,
      provenance: {
        source: "Demonstration data",
        dataset: "Synthetic hourly demand (not from EIA)",
        sourceUrl: DEMO_META.sourceUrl,
        retrievedAt: new Date().toISOString()
      }
    };
  }

  async fetchStateOverview(stateAbbr: string, stateName: string, year: string): Promise<StateOverview> {
    const retrievedAt = new Date().toISOString();
    return {
      state: stateAbbr,
      stateName,
      metrics: [
        { metric: "retail_price", sector: "RES", value: 13.2, units: "cents/kWh", period: year, frequency: "annual" },
        { metric: "retail_price", sector: "COM", value: 11.1, units: "cents/kWh", period: year, frequency: "annual" },
        { metric: "retail_price", sector: "IND", value: 7.4, units: "cents/kWh", period: year, frequency: "annual" },
        { metric: "sales", sector: "ALL", value: 95_000_000, units: "MWh", period: year, frequency: "annual" },
        { metric: "customers", sector: "ALL", value: 3_200_000, units: "customers", period: year, frequency: "annual" }
      ],
      provenance: {
        source: "Demonstration data",
        dataset: "Synthetic state overview (not from EIA)",
        sourceUrl: DEMO_META.sourceUrl,
        retrievedAt
      },
      quality: { status: "demonstration", flags: ["demonstration_data"] }
    };
  }
}

function normalizeDateInput(v: string): string {
  return v.length === 10 ? `${v}T00:00:00Z` : v;
}
