import { describe, expect, it } from "vitest";
import { checkHourlyQuality } from "./validate.js";
import type { NormalizedEnergyRecord } from "../../../shared/types/energy.js";

function rec(overrides: Partial<NormalizedEnergyRecord>): NormalizedEnergyRecord {
  return {
    source: "EIA",
    sourceDataset: "test",
    regionId: "PJM",
    regionName: "PJM Interconnection, LLC",
    regionType: "balancing_authority",
    timezone: "America/New_York",
    timestampUtc: "2025-07-04T12:00:00Z",
    timestampLocal: "2025-07-04T08:00:00-04:00",
    value: 20000,
    units: "MW",
    metric: "actual_demand",
    retrievedAt: "2025-07-05T00:00:00Z",
    sourceUrl: "https://example.com",
    qualityFlags: [],
    ...overrides
  };
}

describe("checkHourlyQuality", () => {
  it("marks a clean hourly series as complete", () => {
    const records = Array.from({ length: 24 }, (_, h) =>
      rec({ timestampUtc: `2025-07-04T${String(h).padStart(2, "0")}:00:00Z`, value: 20000 + h })
    );
    const { cleaned, quality } = checkHourlyQuality(records);
    expect(cleaned).toHaveLength(24);
    expect(quality.status).toBe("complete");
    expect(quality.flags).toEqual([]);
  });

  it("detects a duplicate timestamp and keeps only the first occurrence", () => {
    const records = [rec({ timestampUtc: "2025-07-04T00:00:00Z", value: 1 }), rec({ timestampUtc: "2025-07-04T00:00:00Z", value: 2 })];
    const { cleaned, quality } = checkHourlyQuality(records);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].value).toBe(1);
    expect(quality.flags).toContain("duplicate_timestamp");
  });

  it("drops a record with an unparseable timestamp and flags it", () => {
    const records = [rec({ timestampUtc: "not-a-timestamp" }), rec({ timestampUtc: "2025-07-04T01:00:00Z" })];
    const { cleaned, quality } = checkHourlyQuality(records);
    expect(cleaned).toHaveLength(1);
    expect(quality.flags).toContain("invalid_timestamp");
  });

  it("flags negative demand without dropping the record", () => {
    const records = [rec({ value: -50 })];
    const { cleaned, quality } = checkHourlyQuality(records);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].qualityFlags).toContain("negative_demand");
    expect(quality.flags).toContain("negative_demand");
  });

  it("flags an extreme outlier value", () => {
    const records = [rec({ value: 999_999_999 })];
    const { quality } = checkHourlyQuality(records);
    expect(quality.flags).toContain("extreme_outlier");
  });

  it("detects a gap of missing hours", () => {
    const records = [rec({ timestampUtc: "2025-07-04T00:00:00Z" }), rec({ timestampUtc: "2025-07-04T05:00:00Z" })];
    const { quality } = checkHourlyQuality(records);
    expect(quality.flags).toContain("missing_hours");
    expect(quality.status).toBe("partial");
  });

  it("returns unavailable status for an empty result", () => {
    const { quality } = checkHourlyQuality([]);
    expect(quality.status).toBe("unavailable");
  });
});
