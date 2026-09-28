import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "./index.js";

// No EIA_API_KEY is set in the test environment, so every route below
// exercises the demo-fallback path -- this doubles as the "missing API key
// behavior" and "demonstration fallback" integration coverage.
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  delete process.env.EIA_API_KEY;
  app = createApp();
});

describe("GET /api/energy/regions", () => {
  it("returns all 50 states + DC with the response envelope", async () => {
    const res = await request(app).get("/api/energy/regions");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(51);
    expect(res.body).toHaveProperty("provenance");
    expect(res.body).toHaveProperty("quality");
    expect(res.body).toHaveProperty("cache");
  });

  it("marks Alaska and Hawaii as state_only coverage (no EIA-930 hourly data)", async () => {
    const res = await request(app).get("/api/energy/regions");
    const ak = res.body.data.find((d: any) => d.state.abbr === "AK");
    const hi = res.body.data.find((d: any) => d.state.abbr === "HI");
    expect(ak.coverage).toBe("state_only");
    expect(hi.coverage).toBe("state_only");
  });

  it("marks Virginia as hourly_and_state with a default balancing authority", async () => {
    const res = await request(app).get("/api/energy/regions");
    const va = res.body.data.find((d: any) => d.state.abbr === "VA");
    expect(va.coverage).toBe("hourly_and_state");
    expect(va.defaultBalancingAuthorityId).toBe("PJM");
  });

  it("flags hasRateData only for states with a curated OpenEI utility mapping", async () => {
    const res = await request(app).get("/api/energy/regions");
    const va = res.body.data.find((d: any) => d.state.abbr === "VA");
    const ny = res.body.data.find((d: any) => d.state.abbr === "NY");
    expect(va.hasRateData).toBe(true);
    expect(va.defaultUtilityName).toBe("Virginia Electric & Power Co");
    // NY was live-tested and deliberately left unmapped (see utilities.ts) --
    // must not silently appear as rate-data-covered.
    expect(ny.hasRateData).toBe(false);
    expect(res.body.summary.statesWithRateData).toBe(res.body.data.filter((d: any) => d.hasRateData).length);
  });
});

describe("GET /api/energy/state-overview", () => {
  it("falls back to demonstration data when no API key is configured", async () => {
    const res = await request(app).get("/api/energy/state-overview?state=VA");
    expect(res.status).toBe(200);
    expect(res.body.quality.status).toBe("demonstration");
    expect(res.body.data.metrics.length).toBeGreaterThan(0);
  });

  it("400s on an invalid state code", async () => {
    const res = await request(app).get("/api/energy/state-overview?state=ZZZ");
    expect(res.status).toBe(400);
  });

  it("404s on an unrecognized (but well-formed) state code", async () => {
    const res = await request(app).get("/api/energy/state-overview?state=ZZ");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/energy/load-profile", () => {
  it("returns a demonstration 24-hour peak-day profile when EIA is unavailable", async () => {
    const res = await request(app).get("/api/energy/load-profile?region=PJM&profileType=peak_day&year=2025");
    expect(res.status).toBe(200);
    expect(res.body.quality.status).toBe("demonstration");
    expect(res.body.data.points).toHaveLength(24);
    expect(res.body.data.summary.peakMw).toBeGreaterThan(0);
  });

  it("400s when custom_date is requested without a date", async () => {
    const res = await request(app).get("/api/energy/load-profile?region=PJM&profileType=custom_date");
    expect(res.status).toBe(400);
  });

  it("400s on an invalid profileType", async () => {
    const res = await request(app).get("/api/energy/load-profile?region=PJM&profileType=not_a_type");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/energy/source-status", () => {
  it("reports the demo adapter as active when no key is configured", async () => {
    const res = await request(app).get("/api/energy/source-status");
    expect(res.status).toBe(200);
    expect(res.body.data.activeAdapter).toBe("DEMO");
    expect(res.body.data.apiKeyConfigured).toBe(false);
  });

  it("separately reports the rate-schedule (OpenEI) adapter status alongside the EIA load-data status", async () => {
    // No OPENEI_API_KEY is set in this test environment either -- both
    // sources must independently report they've fallen back to demo, since
    // they're two different API keys/adapters (see rateRegistry.ts) that
    // can be live/demo independently of each other in a real deployment.
    const res = await request(app).get("/api/energy/source-status");
    expect(res.body.data.rates.activeAdapter).toBe("DEMO");
    expect(res.body.data.rates.apiKeyConfigured).toBe(false);
    expect(res.body.data.rates.fellBackToDemo).toBe(true);
    expect(res.body.data.rates.fallbackReason).toMatch(/OPENEI_API_KEY/);
  });
});

describe("POST /api/energy/demand-stack", () => {
  it("computes results for a valid 24-value baseline and assumptions", async () => {
    const res = await request(app)
      .post("/api/energy/demand-stack")
      .send({
        baselineMw: Array(24).fill(10000),
        assumptions: {
          efficiency: { enabled: true, reductionPercent: 5 },
          rates: {
            enabled: false,
            peakWindowStartHour: 17,
            peakWindowEndHour: 20,
            shiftPercent: 0,
            conservationEnabled: false,
            conservationPercent: 0
          },
          demandResponse: {
            enabled: false,
            eventStartHour: 17,
            durationHours: 3,
            participationPercent: 0,
            performancePercent: 0,
            availableCapacityMw: 0
          }
        }
      });
    expect(res.status).toBe(200);
    expect(res.body.data.hourly).toHaveLength(24);
  });

  it("400s on a baseline that is not exactly 24 values", async () => {
    const res = await request(app)
      .post("/api/energy/demand-stack")
      .send({ baselineMw: [1, 2, 3], assumptions: {} });
    expect(res.status).toBe(400);
  });
});
