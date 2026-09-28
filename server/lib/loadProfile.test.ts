import { describe, expect, it } from "vitest";
import type { NormalizedEnergyRecord } from "../../shared/types/energy.js";
import {
  buildCustomDateProfile,
  buildPeakDayProfile,
  buildTypicalWeekdayProfile,
  fillLocalTimestamps,
  groupByLocalDate
} from "./loadProfile.js";

const TZ = "America/New_York";

function hourlyRecordsForDate(dateStr: string, hourlyValues: number[]): NormalizedEnergyRecord[] {
  return hourlyValues.map((value, h) => {
    // Local hour h in New York; roughly UTC+4/5 depending on season, exact
    // offset doesn't matter for these tests since we only assert shape/values.
    const utc = new Date(`${dateStr}T00:00:00Z`);
    utc.setUTCHours(utc.getUTCHours() + h + 4);
    return {
      source: "EIA" as const,
      sourceDataset: "test",
      regionId: "PJM",
      regionName: "PJM Interconnection, LLC",
      regionType: "balancing_authority" as const,
      timezone: TZ,
      timestampUtc: utc.toISOString(),
      timestampLocal: "",
      value,
      units: "MW",
      metric: "actual_demand" as const,
      retrievedAt: new Date().toISOString(),
      sourceUrl: "https://example.com",
      qualityFlags: []
    };
  });
}

describe("loadProfile", () => {
  it("fills local timestamps for records missing them", () => {
    const records = hourlyRecordsForDate("2025-07-14", Array(24).fill(1000));
    const filled = fillLocalTimestamps(records, TZ);
    expect(filled.every((r) => r.timestampLocal.length > 0)).toBe(true);
  });

  it("groups records by local calendar date", () => {
    const day1 = hourlyRecordsForDate("2025-07-14", Array(24).fill(1000));
    const day2 = hourlyRecordsForDate("2025-07-15", Array(24).fill(2000));
    const filled = fillLocalTimestamps([...day1, ...day2], TZ);
    const grouped = groupByLocalDate(filled, TZ);
    expect(grouped.size).toBe(2);
  });

  it("selects the day with the highest single hourly value as the peak day", () => {
    const low = hourlyRecordsForDate("2025-07-14", Array(24).fill(1000));
    const highValues = Array(24).fill(1000);
    highValues[17] = 5000;
    const high = hourlyRecordsForDate("2025-07-15", highValues);
    const filled = fillLocalTimestamps([...low, ...high], TZ);
    const profile = buildPeakDayProfile(filled, TZ, "PJM", "PJM Interconnection, LLC", "actual_demand");
    expect(profile.summary.profileDate).toBe("2025-07-15");
    expect(profile.summary.peakMw).toBe(5000);
  });

  it("builds a custom-date profile with correct summary stats", () => {
    const values = Array(24).fill(100);
    values[12] = 300;
    const records = fillLocalTimestamps(hourlyRecordsForDate("2025-07-14", values), TZ);
    const profile = buildCustomDateProfile(records, TZ, "2025-07-14", "PJM", "PJM Interconnection, LLC", "actual_demand");
    expect(profile.points).toHaveLength(24);
    expect(profile.summary.peakMw).toBe(300);
    expect(profile.summary.minMw).toBe(100);
    expect(profile.summary.dailyEnergyMwh).toBeGreaterThan(0);
  });

  it("averages only complete weekdays in-season for a typical weekday profile, excluding weekends", () => {
    // Mon 2025-07-14 and Tue 2025-07-15 are weekdays; Sat 2025-07-19 is a weekend.
    const weekday1 = hourlyRecordsForDate("2025-07-14", Array(24).fill(1000));
    const weekday2 = hourlyRecordsForDate("2025-07-15", Array(24).fill(2000));
    const weekend = hourlyRecordsForDate("2025-07-19", Array(24).fill(9_000_000));
    const records = fillLocalTimestamps([...weekday1, ...weekday2, ...weekend], TZ);
    const profile = buildTypicalWeekdayProfile(records, TZ, "PJM", "PJM Interconnection, LLC", "actual_demand", "summer");
    expect(profile.summary.sourceDaysUsed).toBe(2);
    // Average of 1000 and 2000 is 1500 for every hour.
    expect(profile.points.every((p) => p.value === 1500)).toBe(true);
  });

  it("excludes an incomplete day from the typical-weekday average", () => {
    const complete = hourlyRecordsForDate("2025-07-14", Array(24).fill(1000));
    const incomplete = hourlyRecordsForDate("2025-07-15", Array(10).fill(9999)); // only 10 hours reported
    const records = fillLocalTimestamps([...complete, ...incomplete], TZ);
    const profile = buildTypicalWeekdayProfile(records, TZ, "PJM", "PJM Interconnection, LLC", "actual_demand", "summer");
    expect(profile.summary.sourceDaysUsed).toBe(1);
    expect(profile.points.every((p) => p.value === 1000)).toBe(true);
  });
});
