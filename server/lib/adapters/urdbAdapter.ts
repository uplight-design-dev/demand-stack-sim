import type { FetchUtilityRatesParams, RateAdapterResult, RateDataAdapter } from "./rateAdapterTypes.js";
import type { UrdbRateRaw } from "../rates/scheduleAnalysis.js";
import { buildUtilityRateOptions } from "../rates/scheduleAnalysis.js";
import { fetchJsonWithRetry, UpstreamError, describeFetchError } from "../httpClient.js";

/**
 * Server-side-only OpenEI Utility Rate Database (URDB) client. `apiKey` is
 * read from process.env.OPENEI_API_KEY by the caller and passed in here --
 * this module never reads the environment itself and never logs a URL
 * containing the key, mirroring EiaDataAdapter's discipline.
 *
 * Endpoint confirmed live against the real API on 2026-09-27:
 *   https://api.openei.org/utility_rates
 * Real, load-bearing finding from that live testing (see
 * server/lib/rates/scheduleAnalysis.ts and demoRateFixture.ts for the full
 * writeup): URDB retains every historical version of a rate forever, so
 * results must be filtered to currently-active (enddate null/absent) items
 * client-side, and a single eiaid can carry rate filings for more than one
 * state-specific "utility" name (Dominion's eiaid 19876 returns both
 * "Virginia Electric & Power Co" and "...(North Carolina)" rows) -- so
 * results are also filtered by exact utility-name match, not eiaid alone.
 */
const URDB_BASE = "https://api.openei.org/utility_rates";

interface UrdbResponseEnvelope {
  items: UrdbRateRaw[];
}

export class UrdbDataAdapter implements RateDataAdapter {
  readonly sourceName = "URDB" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error("UrdbDataAdapter requires a non-empty API key");
    }
  }

  async fetchUtilityRates(params: FetchUtilityRatesParams): Promise<RateAdapterResult> {
    const retrievedAt = new Date().toISOString();
    const url = this.buildUrl([
      ["version", "3"],
      ["format", "json"],
      ["eia", String(params.eiaid)],
      ["sector", params.sector],
      ["detail", "full"],
      ["limit", "50"],
      ["orderby", "startdate"],
      ["direction", "desc"]
    ]);

    // Everything from the fetch through parsing the response into
    // UtilityRateOptions lives in one try/catch. It used to end right after
    // fetchJsonWithRetry, which meant a malformed/unexpected response shape
    // (json.items not actually an array, etc.) threw a raw, unwrapped
    // TypeError straight out of this method -- the caller (rateSchedules.ts)
    // only recognizes UpstreamError specifically, so anything else fell back
    // to a bare "urdb_unavailable" flag with no detail at all. Confirmed
    // live in production (2026-09-28): the deployed Rate Explorer showed
    // exactly that bare flag, with none of the ": <real reason>" detail an
    // UpstreamError carries -- this is what caused it.
    try {
      const json = (await fetchJsonWithRetry(url, { serviceLabel: "OpenEI URDB" })) as UrdbResponseEnvelope;

      if (!Array.isArray(json.items)) {
        throw new UpstreamError(
          `OpenEI URDB returned an unexpected response shape (no "items" array) -- got: ${JSON.stringify(json).slice(0, 200)}`
        );
      }

      const items = json.items.filter((r) => r.eiaid === params.eiaid && r.utility === params.utilityName);

      const data = buildUtilityRateOptions(items, {
        eiaid: params.eiaid,
        utilityName: params.utilityName,
        state: params.state,
        sector: params.sector
      });

      return {
        data,
        provenance: {
          source: "OpenEI Utility Rate Database (URDB)",
          dataset: `Utility rate schedules -- utility_rates (eiaid ${params.eiaid}, sector ${params.sector})`,
          sourceUrl: "https://apps.openei.org/USURDB/",
          retrievedAt
        }
      };
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      throw new UpstreamError(`OpenEI URDB request failed: ${describeFetchError(err)}`);
    }
  }

  private buildUrl(params: Array<[string, string]>): string {
    const usp = new URLSearchParams();
    usp.set("api_key", this.apiKey);
    for (const [k, v] of params) usp.append(k, v);
    return `${URDB_BASE}/?${usp.toString()}`;
  }
}
