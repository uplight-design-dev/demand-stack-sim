import { describe, expect, it } from "vitest";
import { buildUtilityRateOptions, isCurrentlyActive, normalizeRateSchedule } from "./scheduleAnalysis.js";
import { DEMO_RATE_RAW_VA_RESIDENTIAL } from "./demoRateFixture.js";

describe("scheduleAnalysis against real captured Dominion VA rate data", () => {
  it("computes effective rate as rate + adj and classifies the flat schedule's periods as flat (no peak/off-peak distinction)", () => {
    const [flatRaw] = DEMO_RATE_RAW_VA_RESIDENTIAL;
    const schedule = normalizeRateSchedule(flatRaw);

    expect(schedule.hasTimeOfUse).toBe(false);
    expect(schedule.periods.every((p) => p.kind === "flat")).toBe(true);
    // tier 0 of period 0: rate 0.076602 + adj 0.086944
    expect(schedule.periods[0].tiers[0].effectiveUsdPerKwh).toBeCloseTo(0.163546, 6);
  });

  it("classifies the TOU schedule's two periods as on/off-peak and detects hasTimeOfUse", () => {
    const [, touRaw] = DEMO_RATE_RAW_VA_RESIDENTIAL;
    const schedule = normalizeRateSchedule(touRaw);

    expect(schedule.hasTimeOfUse).toBe(true);
    const onPeak = schedule.periods.find((p) => p.kind === "on_peak");
    const offPeak = schedule.periods.find((p) => p.kind === "off_peak");
    expect(onPeak?.representativeUsdPerKwh).toBeGreaterThan(offPeak?.representativeUsdPerKwh ?? Infinity);

    // Two separate on-peak blocks per weekday in the non-summer months --
    // confirmed real from the live capture (Jan row): 7-10 and 17-20.
    const janRow = schedule.weekdaySchedule[0];
    const onPeakHoursJan = janRow.flatMap((periodIdx, hour) => (periodIdx === onPeak?.periodIndex ? [hour] : []));
    expect(onPeakHoursJan).toEqual([7, 8, 9, 10, 17, 18, 19, 20]);
  });

  it("treats a schedule with no enddate as currently active", () => {
    expect(isCurrentlyActive(DEMO_RATE_RAW_VA_RESIDENTIAL[0])).toBe(true);
    expect(isCurrentlyActive({ ...DEMO_RATE_RAW_VA_RESIDENTIAL[0], enddate: 1700000000 })).toBe(false);
  });

  it("buildUtilityRateOptions picks the flat schedule as default and surfaces the TOU schedule as an alternative", () => {
    const options = buildUtilityRateOptions(DEMO_RATE_RAW_VA_RESIDENTIAL, {
      eiaid: 19876,
      utilityName: "Virginia Electric & Power Co",
      state: "VA",
      sector: "Residential"
    });

    expect(options.defaultSchedule?.name).toBe("Residential Schedule 1");
    expect(options.alternativeSchedules).toHaveLength(1);
    expect(options.alternativeSchedules[0].hasTimeOfUse).toBe(true);
    expect(options.qualityFlags).toContain("default_inferred_not_source_flagged");
  });

  it("returns no_active_approved_rates_found (never fabricates a default) when nothing is currently active", () => {
    const expiredOnly = DEMO_RATE_RAW_VA_RESIDENTIAL.map((r) => ({ ...r, enddate: 1451520000 }));
    const options = buildUtilityRateOptions(expiredOnly, {
      eiaid: 19876,
      utilityName: "Virginia Electric & Power Co",
      state: "VA",
      sector: "Residential"
    });
    expect(options.defaultSchedule).toBeNull();
    expect(options.alternativeSchedules).toHaveLength(0);
    expect(options.qualityFlags).toContain("no_active_approved_rates_found");
  });
});
