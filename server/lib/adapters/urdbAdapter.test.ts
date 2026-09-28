import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UrdbDataAdapter } from "./urdbAdapter.js";
import { DEMO_RATE_RAW_VA_RESIDENTIAL } from "../rates/demoRateFixture.js";
import type { UrdbRateRaw } from "../rates/scheduleAnalysis.js";

/**
 * DEMO_RATE_RAW_VA_RESIDENTIAL holds real, unmodified rate items captured
 * live from api.openei.org/utility_rates (eia=19876, sector=Residential,
 * utility="Virginia Electric & Power Co") on 2026-09-27 -- see
 * demoRateFixture.ts for the full provenance note. Reusing that same real
 * data here (rather than inventing a synthetic fixture) means this suite
 * exercises the adapter's actual parsing/filtering logic against genuine
 * URDB response shapes, the same discipline as eiaAdapter.test.ts.
 */

// A same-eiaid, different-state-entity row -- confirmed live: URDB really
// does return this for eia=19876 alongside the Virginia rows. Included here
// to regression-test the exact-utility-name filter.
const NC_HOMONYM_ROW: UrdbRateRaw = {
  label: "68b0c9e8b3e74c9f610d5b4a",
  utility: "Virginia Electric & Power Co (North Carolina)",
  eiaid: 19876,
  name: "Basic Residential Rate Schedule 1",
  sector: "Residential",
  approved: true,
  startdate: 1738371600,
  enddate: null,
  energyratestructure: [[{ unit: "kWh", rate: 0.105123, adj: -0.005779 }]],
  energyweekdayschedule: Array.from({ length: 12 }, () => Array(24).fill(0)),
  energyweekendschedule: Array.from({ length: 12 }, () => Array(24).fill(0))
};

// A real-shaped but EXPIRED Virginia row (enddate in the past) -- URDB
// keeps every historical version forever, confirmed live, so the adapter
// must exclude this even though the eiaid/utility name match.
const EXPIRED_VA_ROW: UrdbRateRaw = {
  label: "539f70b2ec4f024411ecdd45",
  utility: "Virginia Electric & Power Co",
  eiaid: 19876,
  name: "1 Residential Service",
  sector: "Residential",
  approved: true,
  startdate: 1327453200,
  enddate: 1451520000,
  energyratestructure: [[{ unit: "kWh", rate: 0.05, adj: 0.01 }]],
  energyweekdayschedule: Array.from({ length: 12 }, () => Array(24).fill(0)),
  energyweekendschedule: Array.from({ length: 12 }, () => Array(24).fill(0))
};

describe("UrdbDataAdapter against a real captured URDB response", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes real Dominion VA rates, excluding expired and cross-state-homonym rows", async () => {
    let capturedUrl = "";
    fetchMock.mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [...DEMO_RATE_RAW_VA_RESIDENTIAL, NC_HOMONYM_ROW, EXPIRED_VA_ROW] })
      };
    });

    const adapter = new UrdbDataAdapter("test-key");
    const result = await adapter.fetchUtilityRates({
      eiaid: 19876,
      utilityName: "Virginia Electric & Power Co",
      state: "VA",
      sector: "Residential"
    });

    expect(capturedUrl).toContain("eia=19876");
    expect(capturedUrl).toContain("sector=Residential");
    expect(capturedUrl).toContain("detail=full");
    expect(capturedUrl).toContain("api_key=test-key");

    // Only the 2 real, currently-active, correctly-named-utility rows should survive.
    const allLabels = [result.data.defaultSchedule?.id, ...result.data.alternativeSchedules.map((s) => s.id)];
    expect(allLabels).not.toContain(NC_HOMONYM_ROW.label);
    expect(allLabels).not.toContain(EXPIRED_VA_ROW.label);
    expect(allLabels.filter(Boolean)).toHaveLength(2);
  });

  it("infers the standard schedule by name when URDB has no is_default flag (real, confirmed data-quality gap)", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: DEMO_RATE_RAW_VA_RESIDENTIAL })
    });

    const adapter = new UrdbDataAdapter("test-key");
    const result = await adapter.fetchUtilityRates({
      eiaid: 19876,
      utilityName: "Virginia Electric & Power Co",
      state: "VA",
      sector: "Residential"
    });

    expect(result.data.defaultSchedule?.name).toBe("Residential Schedule 1");
    expect(result.data.defaultSchedule?.hasTimeOfUse).toBe(false);
    expect(result.data.qualityFlags).toContain("default_inferred_not_source_flagged");

    // The real TOU rate should show up as an alternative with the two
    // separate on-peak blocks/day the demandStackEngine test also relies on.
    const tou = result.data.alternativeSchedules.find((s) => s.hasTimeOfUse);
    expect(tou?.name).toBe("Residential Energy TOU Schedule 1T");
    expect(tou?.periods.find((p) => p.kind === "on_peak")?.representativeUsdPerKwh).toBeCloseTo(0.2339, 3);
    expect(tou?.periods.find((p) => p.kind === "off_peak")?.representativeUsdPerKwh).toBeCloseTo(0.119251, 3);
  });
});
