import type { FetchUtilityRatesParams, RateAdapterResult, RateDataAdapter } from "./rateAdapterTypes.js";
import { buildUtilityRateOptions } from "../rates/scheduleAnalysis.js";
import { DEMO_RATE_FIXTURE_RETRIEVED_AT, DEMO_RATE_RAW_VA_RESIDENTIAL } from "../rates/demoRateFixture.js";

/**
 * No-key / upstream-unavailable fallback. Unlike DemoDataAdapter (which
 * generates synthetic load data), this serves a frozen snapshot of REAL
 * Dominion Energy Virginia rate schedules captured live from URDB -- see
 * demoRateFixture.ts for the capture date and provenance. It never
 * fabricates numbers; it just isn't guaranteed to reflect the current live
 * rate if URDB has since changed it. Only Virginia/eiaid 19876 has fixture
 * data; any other utility gets an empty (not fabricated) result.
 */
export class RateDemoAdapter implements RateDataAdapter {
  readonly sourceName = "DEMO" as const;

  async fetchUtilityRates(params: FetchUtilityRatesParams): Promise<RateAdapterResult> {
    const items =
      params.eiaid === 19876 && params.sector === "Residential" ? DEMO_RATE_RAW_VA_RESIDENTIAL : [];

    const data = buildUtilityRateOptions(items, {
      eiaid: params.eiaid,
      utilityName: params.utilityName,
      state: params.state,
      sector: params.sector
    });
    data.qualityFlags.push("demonstration_data");

    return {
      data,
      provenance: {
        source: "Demonstration data (frozen real URDB snapshot)",
        dataset: `Utility rate schedules captured ${DEMO_RATE_FIXTURE_RETRIEVED_AT} -- not live`,
        sourceUrl: "https://apps.openei.org/USURDB/",
        retrievedAt: DEMO_RATE_FIXTURE_RETRIEVED_AT
      }
    };
  }
}
