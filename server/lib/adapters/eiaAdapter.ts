import type { EnergyDataAdapter, AdapterFetchResult, FetchHourlyParams } from "./types.js";
import type { EnergyMetric, NormalizedEnergyRecord, StateOverview, StateOverviewMetric } from "../../../shared/types/energy.js";
import { fetchJsonWithRetry, UpstreamError, describeFetchError } from "../httpClient.js";

/**
 * Server-side-only EIA API v2 client. `apiKey` is read from
 * process.env.EIA_API_KEY by the caller and passed in here -- this module
 * never reads the environment itself and never logs a URL containing the key.
 *
 * Routes used (confirmed against the live EIA v2 API metadata on 2026-09-27):
 *  - electricity/rto/region-data  -> hourly demand/forecast by balancing authority (Form EIA-930)
 *  - electricity/retail-sales     -> state-level price/sales/customers/revenue by sector
 */
const EIA_BASE = "https://api.eia.gov/v2";
const MAX_ROWS_PER_PAGE = 5000;
const MAX_PAGES = 4; // safety cap: 20,000 hourly rows (~2.3 years) per request

const METRIC_TO_EIA_TYPE: Record<Extract<EnergyMetric, "actual_demand" | "forecast_demand">, string> = {
  actual_demand: "D",
  forecast_demand: "DF"
};
const EIA_TYPE_TO_METRIC: Record<string, EnergyMetric> = {
  D: "actual_demand",
  DF: "forecast_demand",
  NG: "net_generation",
  TI: "interchange"
};

interface EiaRegionDataRow {
  period: string; // "YYYY-MM-DDTHH" in UTC (frequency=hourly)
  respondent: string;
  "respondent-name": string;
  type: string;
  "type-name": string;
  value: number | string | null;
  "value-units": string;
}

interface EiaResponseEnvelope<TRow> {
  response: {
    data: TRow[];
    total?: string;
  };
}

export class EiaDataAdapter implements EnergyDataAdapter {
  readonly sourceName = "EIA" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("EiaDataAdapter requires a non-empty API key");
    }
  }

  async fetchHourlyDemand(params: FetchHourlyParams): Promise<AdapterFetchResult<NormalizedEnergyRecord>> {
    const metric = params.metric ?? "actual_demand";
    const eiaType = METRIC_TO_EIA_TYPE[metric as "actual_demand" | "forecast_demand"];
    if (!eiaType) {
      throw new Error(`EIA adapter cannot fetch metric "${metric}" from electricity/rto/region-data`);
    }

    const retrievedAt = new Date().toISOString();
    const rows: EiaRegionDataRow[] = [];
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url = this.buildUrl("electricity/rto/region-data/data", [
        ["frequency", "hourly"],
        ["data[]", "value"],
        ["facets[respondent][]", params.regionId],
        ["facets[type][]", eiaType],
        ["start", toEiaPeriod(params.startUtc)],
        ["end", toEiaPeriod(params.endUtc)],
        ["sort[0][column]", "period"],
        ["sort[0][direction]", "asc"],
        ["offset", String(offset)],
        ["length", String(MAX_ROWS_PER_PAGE)]
      ]);

      let json: EiaResponseEnvelope<EiaRegionDataRow>;
      try {
        json = (await fetchJsonWithRetry(url)) as EiaResponseEnvelope<EiaRegionDataRow>;
      } catch (err) {
        if (err instanceof UpstreamError) throw err;
        throw new UpstreamError(`EIA request failed: ${describeFetchError(err)}`);
      }

      const pageRows = json.response?.data ?? [];
      rows.push(...pageRows);
      if (pageRows.length < MAX_ROWS_PER_PAGE) break;
      offset += MAX_ROWS_PER_PAGE;
    }

    const records: NormalizedEnergyRecord[] = rows
      .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
      .map((r) => {
        const utcIso = `${r.period}:00:00Z`; // period is "YYYY-MM-DDTHH" UTC
        return {
          source: "EIA",
          sourceDataset: "electricity/rto/region-data",
          seriesId: `EBA.${r.respondent}-ALL.${r.type}.H`,
          regionId: r.respondent,
          regionName: r["respondent-name"] ?? params.regionName,
          regionType: "balancing_authority",
          timezone: params.timezone,
          timestampUtc: utcIso,
          timestampLocal: "", // filled in by the caller once timezone is confirmed (see loadProfile.ts)
          value: Number(r.value!),
          units: "MW",
          metric: EIA_TYPE_TO_METRIC[r.type] ?? "actual_demand",
          retrievedAt,
          sourceUrl: `https://www.eia.gov/opendata/browser/electricity/rto/region-data`,
          qualityFlags: []
        } satisfies NormalizedEnergyRecord;
      });

    return {
      records,
      provenance: {
        source: "U.S. Energy Information Administration (EIA)",
        dataset: "Hourly Electric Grid Monitor (Form EIA-930) -- electricity/rto/region-data",
        sourceUrl: "https://www.eia.gov/opendata/browser/electricity/rto/region-data",
        retrievedAt
      }
    };
  }

  async fetchStateOverview(stateAbbr: string, stateName: string, year: string): Promise<StateOverview> {
    const retrievedAt = new Date().toISOString();
    const url = this.buildUrl("electricity/retail-sales/data", [
      ["frequency", "annual"],
      // NOTE: EIA v2 silently returns only the FIRST value when multiple data
      // columns are requested with repeated "data[]=" params -- confirmed by
      // live testing against the real API (data[]=price&data[]=sales returned
      // price only, on every row, no error or warning). Indexed array syntax
      // ("data[0]=", "data[1]=", ...) is required to get all four columns back.
      ["data[0]", "price"],
      ["data[1]", "sales"],
      ["data[2]", "customers"],
      ["data[3]", "revenue"],
      ["facets[stateid][]", stateAbbr],
      ["start", year],
      ["end", year],
      ["sort[0][column]", "period"],
      ["sort[0][direction]", "desc"],
      ["length", "50"]
    ]);

    let json: EiaResponseEnvelope<Record<string, unknown>>;
    try {
      json = (await fetchJsonWithRetry(url)) as EiaResponseEnvelope<Record<string, unknown>>;
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`EIA request failed: ${describeFetchError(err)}`);
    }

    const rows = json.response?.data ?? [];
    const metrics: StateOverviewMetric[] = [];
    for (const row of rows) {
      const sector = (row.sectorid as string) ?? "ALL";
      const period = String(row.period);
      if (row.price !== undefined && row.price !== null) {
        metrics.push({ metric: "retail_price", sector: sector as StateOverviewMetric["sector"], value: Number(row.price), units: "cents/kWh", period, frequency: "annual" });
      }
      if (row.sales !== undefined && row.sales !== null) {
        metrics.push({ metric: "sales", sector: sector as StateOverviewMetric["sector"], value: Number(row.sales), units: "thousand MWh", period, frequency: "annual" });
      }
      if (row.customers !== undefined && row.customers !== null) {
        metrics.push({ metric: "customers", sector: sector as StateOverviewMetric["sector"], value: Number(row.customers), units: "customers", period, frequency: "annual" });
      }
      if (row.revenue !== undefined && row.revenue !== null) {
        metrics.push({ metric: "revenue", sector: sector as StateOverviewMetric["sector"], value: Number(row.revenue), units: "million $", period, frequency: "annual" });
      }
    }

    return {
      state: stateAbbr,
      stateName,
      metrics,
      provenance: {
        source: "U.S. Energy Information Administration (EIA)",
        dataset: "Electricity sales to ultimate customers -- electricity/retail-sales",
        sourceUrl: "https://www.eia.gov/opendata/browser/electricity/retail-sales",
        retrievedAt
      },
      quality: {
        status: metrics.length > 0 ? "complete" : "unavailable",
        flags: metrics.length > 0 ? [] : ["no_rows_returned"]
      }
    };
  }

  private buildUrl(path: string, params: Array<[string, string]>): string {
    const usp = new URLSearchParams();
    usp.set("api_key", this.apiKey);
    for (const [k, v] of params) usp.append(k, v);
    return `${EIA_BASE}/${path}/?${usp.toString()}`;
  }
}

function toEiaPeriod(isoLike: string): string {
  // Accepts "YYYY-MM-DD" or a full ISO datetime and returns "YYYY-MM-DDTHH".
  const d = new Date(isoLike.length === 10 ? `${isoLike}T00:00:00Z` : isoLike);
  return d.toISOString().slice(0, 13);
}
