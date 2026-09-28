import type { RateSchedule } from "@shared/types/rates";

/**
 * Pure, schedule-only calculations -- no invented "typical customer usage"
 * numbers live here. Callers decide what scale (system MW, a single
 * household's kWh, ...) the hourly values represent; these functions just
 * apply a real rate schedule's structure to whatever series they're given.
 */

/** Local hour (0-11 month index, Jan=0) -> period index, from the schedule's own weekday/weekend matrix. */
function periodIndexForHour(schedule: RateSchedule, monthIndex: number, hour: number, isWeekend: boolean): number | undefined {
  const matrix = isWeekend ? schedule.weekendSchedule : schedule.weekdaySchedule;
  return matrix?.[monthIndex]?.[hour];
}

/** 24-value effective $/kWh series for one representative day (a given month + weekday-or-weekend), using each period's representative (lowest-tier) rate. */
export function hourlyRateSeriesUsdPerKwh(schedule: RateSchedule, monthIndex: number, isWeekend: boolean): number[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const idx = periodIndexForHour(schedule, monthIndex, hour, isWeekend);
    const period = idx !== undefined ? schedule.periods.find((p) => p.periodIndex === idx) : undefined;
    return period?.representativeUsdPerKwh ?? 0;
  });
}

/** Local hours (0-23) classified "on_peak" for this month + weekday-or-weekend, straight from the schedule's own period classification -- never guessed. */
export function onPeakHours(schedule: RateSchedule, monthIndex: number, isWeekend: boolean): number[] {
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const idx = periodIndexForHour(schedule, monthIndex, hour, isWeekend);
    const period = idx !== undefined ? schedule.periods.find((p) => p.periodIndex === idx) : undefined;
    if (period?.kind === "on_peak") hours.push(hour);
  }
  return hours;
}

/**
 * cost = sum(value[hour] * effectiveRate[hour]) for a representative day.
 * The result's unit follows whatever unit `hourlyValues` is in -- pass kWh
 * for a USD result, MWh for a USD-per-MWh-priced result, etc. This
 * function makes no assumption about what scale (one customer, a whole
 * system) the series represents; it is deliberately just the arithmetic,
 * so it can never imply a bill total more precise than what was fed in.
 */
export function scheduleWeightedCost(hourlyValues: number[], schedule: RateSchedule, monthIndex: number, isWeekend: boolean): number {
  const rates = hourlyRateSeriesUsdPerKwh(schedule, monthIndex, isWeekend);
  return hourlyValues.reduce((sum, v, hour) => sum + v * (rates[hour] ?? 0), 0);
}

/**
 * Energy-weighted average effective rate a usage shape would see under this
 * schedule -- useful for an honest "this shape costs ~X¢/kWh on average
 * under this rate" comparison without claiming a dollar total for a system
 * whose actual customer count/usage isn't part of this model. Returns null
 * for an all-zero or empty series (nothing to weight by).
 */
export function weightedAverageRateUsdPerKwh(hourlyValues: number[], schedule: RateSchedule, monthIndex: number, isWeekend: boolean): number | null {
  const total = hourlyValues.reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  return scheduleWeightedCost(hourlyValues, schedule, monthIndex, isWeekend) / total;
}

/**
 * cost = sum(kwh[hour] * effectiveRate[hour]), named for the common case of
 * estimating one representative day's variable energy cost (excludes the
 * schedule's fixed monthly charge, which isn't a per-day figure). Thin,
 * explicitly-named wrapper over scheduleWeightedCost for that use.
 */
export function estimateDailyBillUsd(hourlyKwh: number[], schedule: RateSchedule, monthIndex: number, isWeekend: boolean): number {
  return scheduleWeightedCost(hourlyKwh, schedule, monthIndex, isWeekend);
}
