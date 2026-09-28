import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EiaDataAdapter } from "./eiaAdapter.js";

/**
 * These fixtures are exact, unmodified JSON responses captured live from
 * api.eia.gov (via a real request with a real EIA_API_KEY) during development.
 * They exist to catch real integration bugs that only the live API surfaces --
 * this suite already caught one: EIA v2 silently returns only the FIRST data
 * column when multiple are requested with repeated "data[]=" params (no error,
 * no warning -- it just drops the rest). Indexed "data[0]=", "data[1]=", ...
 * syntax is required. See the comment in eiaAdapter.ts's fetchStateOverview.
 *
 * global.fetch is mocked so no network call is made in CI; the point is to
 * run the real, unmodified adapter/parsing code against real API-shaped data.
 */

const REAL_REGION_DATA_RESPONSE = {
  response: {
    total: "6",
    dateFormat: 'YYYY-MM-DD"T"HH24',
    frequency: "hourly",
    data: [
      { period: "2025-07-04T05", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "99443", "value-units": "megawatthours" },
      { period: "2025-07-04T04", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "104359", "value-units": "megawatthours" },
      { period: "2025-07-04T03", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "111602", "value-units": "megawatthours" },
      { period: "2025-07-04T02", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "118980", "value-units": "megawatthours" },
      { period: "2025-07-04T01", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "125317", "value-units": "megawatthours" },
      { period: "2025-07-04T00", respondent: "PJM", "respondent-name": "PJM Interconnection, LLC", type: "D", "type-name": "Demand", value: "132129", "value-units": "megawatthours" }
    ]
  }
};

const REAL_RETAIL_SALES_RESPONSE = {
  response: {
    total: "6",
    dateFormat: "YYYY",
    frequency: "annual",
    data: [
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "ALL", sectorName: "all sectors", price: "10.68", sales: "132318.50501", customers: "4061081", revenue: "14127.91913", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" },
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "COM", sectorName: "commercial", price: "8.95", sales: "73807.03499", customers: "441468", revenue: "6604.43674", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" },
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "IND", sectorName: "industrial", price: "8.92", sales: "15176.02202", customers: "3673", revenue: "1353.01359", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" },
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "OTH", sectorName: "other", price: "0", sales: "0", customers: "0", revenue: "0", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" },
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "RES", sectorName: "residential", price: "14.26", sales: "43095.83801", customers: "3615939", revenue: "6145.51091", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" },
      { period: "2023", stateid: "VA", stateDescription: "Virginia", sectorid: "TRA", sectorName: "transportation", price: "10.42", sales: "239.61", customers: "1", revenue: "24.9579", "price-units": "cents per kilowatt-hour", "sales-units": "million kilowatt hours", "customers-units": "number of customers", "revenue-units": "million dollars" }
    ]
  }
};

describe("EiaDataAdapter against real captured EIA responses", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a real electricity/rto/region-data response into normalized records", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => REAL_REGION_DATA_RESPONSE
    });

    const adapter = new EiaDataAdapter("test-key");
    const result = await adapter.fetchHourlyDemand({
      regionId: "PJM",
      regionName: "PJM Interconnection, LLC",
      timezone: "America/New_York",
      startUtc: "2025-07-04T00:00:00Z",
      endUtc: "2025-07-04T05:00:00Z",
      metric: "actual_demand"
    });

    expect(result.records).toHaveLength(6);
    expect(result.records[0]).toMatchObject({
      source: "EIA",
      regionId: "PJM",
      timestampUtc: "2025-07-04T05:00:00Z",
      value: 99443,
      units: "MW",
      metric: "actual_demand"
    });
    // Real payload sends value as a numeric string -- confirms Number(r.value!) works.
    expect(typeof result.records[0].value).toBe("number");
  });

  it("requests all four retail-sales columns using indexed data[N]= params (regression for the dropped-columns bug)", async () => {
    let capturedUrl = "";
    fetchMock.mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => REAL_RETAIL_SALES_RESPONSE };
    });

    const adapter = new EiaDataAdapter("test-key");
    const overview = await adapter.fetchStateOverview("VA", "Virginia", "2023");

    // EIA v2 silently drops every data[] column but the first when the repeated
    // "data[]=" form is used -- this asserts the fix (indexed form) stays in place.
    expect(capturedUrl).toMatch(/data%5B0%5D=price|data\[0\]=price/);
    expect(capturedUrl).toMatch(/data%5B1%5D=sales|data\[1\]=sales/);
    expect(capturedUrl).toMatch(/data%5B2%5D=customers|data\[2\]=customers/);
    expect(capturedUrl).toMatch(/data%5B3%5D=revenue|data\[3\]=revenue/);
    expect(capturedUrl).not.toContain("data[]=");
    expect(capturedUrl).not.toContain("data%5B%5D=");

    // All 6 sectors x 4 metrics should be present, not just price.
    expect(overview.metrics).toHaveLength(24);

    const byKey = new Map(overview.metrics.map((m) => [`${m.sector}.${m.metric}`, m.value]));
    expect(byKey.get("ALL.retail_price")).toBe(10.68);
    expect(byKey.get("ALL.sales")).toBe(132318.50501);
    expect(byKey.get("ALL.customers")).toBe(4061081);
    expect(byKey.get("ALL.revenue")).toBe(14127.91913);
    expect(byKey.get("RES.customers")).toBe(3615939);
    expect(byKey.get("COM.sales")).toBe(73807.03499);
    expect(overview.quality.status).toBe("complete");
  });
});
