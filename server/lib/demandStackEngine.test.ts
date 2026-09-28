import { describe, expect, it } from "vitest";
import { simulateDemandStack } from "./demandStackEngine.js";
import type { DemandStackAssumptions } from "../../shared/types/demandStack.js";

const FLAT_BASELINE = Array(24).fill(10_000);

const ALL_OFF: DemandStackAssumptions = {
  efficiency: { enabled: false, reductionPercent: 0 },
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
};

describe("simulateDemandStack", () => {
  it("returns the baseline unchanged when every layer is disabled", () => {
    const results = simulateDemandStack(FLAT_BASELINE, ALL_OFF);
    expect(results.hourly.every((h) => h.resultingLoadMw === h.baselineMw)).toBe(true);
    expect(results.peakReductionMw).toBe(0);
  });

  it("applies a persistent percentage reduction for efficiency", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      efficiency: { enabled: true, reductionPercent: 10 }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    expect(results.hourly.every((h) => h.efficiencyReductionMw === 1000)).toBe(true);
    expect(results.hourly.every((h) => h.resultingLoadMw === 9000)).toBe(true);
  });

  it("shifts demand out of the peak window and preserves total daily energy when conservation is off", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      rates: {
        enabled: true,
        peakWindowStartHour: 17,
        peakWindowEndHour: 19,
        shiftPercent: 50,
        conservationEnabled: false,
        conservationPercent: 0
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    const totalBefore = FLAT_BASELINE.reduce((a, b) => a + b, 0);
    const totalAfter = results.hourly.reduce((a, h) => a + h.resultingLoadMw, 0);
    expect(totalAfter).toBeCloseTo(totalBefore, 0);
    // Peak-window hours should be reduced.
    expect(results.hourly[17].resultingLoadMw).toBeLessThan(10_000);
    expect(results.hourly[18].resultingLoadMw).toBeLessThan(10_000);
    // Some off-peak hour should have received the shifted load.
    expect(results.hourly[2].resultingLoadMw).toBeGreaterThan(10_000);
  });

  it("permanently reduces energy (does not fully redistribute) when conservation is enabled", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      rates: {
        enabled: true,
        peakWindowStartHour: 17,
        peakWindowEndHour: 19,
        shiftPercent: 50,
        conservationEnabled: true,
        conservationPercent: 100 // fully conserved: nothing redistributed
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    const totalBefore = FLAT_BASELINE.reduce((a, b) => a + b, 0);
    const totalAfter = results.hourly.reduce((a, h) => a + h.resultingLoadMw, 0);
    expect(totalAfter).toBeLessThan(totalBefore);
    // No off-peak hour should have gained load.
    expect(results.hourly[2].resultingLoadMw).toBe(10_000);
  });

  it("applies a demand response reduction only during the event window", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      demandResponse: {
        enabled: true,
        eventStartHour: 17,
        durationHours: 3,
        participationPercent: 50,
        performancePercent: 100,
        availableCapacityMw: 1000
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    for (const h of results.hourly) {
      if ([17, 18, 19].includes(h.hour)) {
        expect(h.demandResponseReductionMw).toBe(500); // 1000 * 50% participation * 100% performance
      } else {
        expect(h.demandResponseReductionMw).toBe(0);
      }
    }
  });

  it("wraps a demand response event window across midnight correctly", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      demandResponse: {
        enabled: true,
        eventStartHour: 23,
        durationHours: 3,
        participationPercent: 100,
        performancePercent: 100,
        availableCapacityMw: 500
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    const activeHours = results.hourly.filter((h) => h.demandResponseReductionMw > 0).map((h) => h.hour);
    expect(activeHours.sort((a, b) => a - b)).toEqual([0, 1, 23]);
  });

  it("never produces a negative resulting load even with extreme stacked assumptions", () => {
    const assumptions: DemandStackAssumptions = {
      efficiency: { enabled: true, reductionPercent: 90 },
      rates: {
        enabled: true,
        peakWindowStartHour: 0,
        peakWindowEndHour: 23,
        shiftPercent: 90,
        conservationEnabled: true,
        conservationPercent: 90
      },
      demandResponse: {
        enabled: true,
        eventStartHour: 0,
        durationHours: 8,
        participationPercent: 100,
        performancePercent: 100,
        availableCapacityMw: 50_000
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    expect(results.hourly.every((h) => h.resultingLoadMw >= 0)).toBe(true);
  });

  it("classifies every layer contribution as calculated, never observed", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      efficiency: { enabled: true, reductionPercent: 5 }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    expect(results.contributions.every((c) => c.valueClass === "calculated")).toBe(true);
  });

  it("throws if given anything other than 24 baseline values", () => {
    expect(() => simulateDemandStack([1, 2, 3], ALL_OFF)).toThrow();
  });

  it("uses a non-contiguous peakHours override instead of the start/end window when supplied", () => {
    // Mirrors a real applied rate's shape: two separate on-peak blocks in
    // one day (e.g. Dominion VA's residential TOU rate, 7-10 & 17-20),
    // which a single peakWindowStartHour/peakWindowEndHour range cannot
    // express -- confirmed against real URDB data, see rateSchedules.
    const nonContiguousHours = [7, 8, 9, 10, 17, 18, 19, 20];
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      rates: {
        enabled: true,
        // Deliberately mismatched start/end window -- must be ignored in
        // favor of peakHours when peakHours is present and non-empty.
        peakWindowStartHour: 0,
        peakWindowEndHour: 1,
        peakHours: nonContiguousHours,
        shiftPercent: 50,
        conservationEnabled: false,
        conservationPercent: 0
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);

    for (const hour of nonContiguousHours) {
      expect(results.hourly[hour].resultingLoadMw).toBeLessThan(10_000);
    }
    // Hours inside the (ignored) start/end window but NOT in peakHours must
    // not be treated as peak (i.e. never shifted away) -- proves peakHours
    // fully overrides the start/end window rather than being unioned with it.
    expect(results.hourly[0].ratesAdjustmentMw).toBeGreaterThanOrEqual(0);
    // An off-peak hour outside both the ignored window and peakHours should have gained load.
    expect(results.hourly[2].resultingLoadMw).toBeGreaterThan(10_000);

    const totalBefore = FLAT_BASELINE.reduce((a, b) => a + b, 0);
    const totalAfter = results.hourly.reduce((a, h) => a + h.resultingLoadMw, 0);
    expect(totalAfter).toBeCloseTo(totalBefore, 0);
  });

  it("falls back to the start/end window when peakHours is an empty array", () => {
    const assumptions: DemandStackAssumptions = {
      ...ALL_OFF,
      rates: {
        enabled: true,
        peakWindowStartHour: 17,
        peakWindowEndHour: 19,
        peakHours: [],
        shiftPercent: 50,
        conservationEnabled: false,
        conservationPercent: 0
      }
    };
    const results = simulateDemandStack(FLAT_BASELINE, assumptions);
    expect(results.hourly[17].resultingLoadMw).toBeLessThan(10_000);
    expect(results.hourly[18].resultingLoadMw).toBeLessThan(10_000);
  });
});
