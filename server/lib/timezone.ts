import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Timezone handling for hourly grid data.
 *
 * EIA gives us UTC timestamps. Everything the user sees must be in the
 * selected region's local time, computed correctly across DST transitions.
 * We never treat a UTC timestamp as if it were already local, and we never
 * invent an hour that a local calendar day does not actually have.
 */

/** Convert a UTC ISO timestamp into a local ISO string (with offset) for tz. */
export function utcToLocalIso(utcIso: string, timeZone: string): string {
  const utcDate = new Date(utcIso);
  if (Number.isNaN(utcDate.getTime())) {
    throw new Error(`utcToLocalIso: invalid UTC timestamp "${utcIso}"`);
  }
  return formatInTimeZone(utcDate, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Local hour (0-23) of a UTC timestamp in the given timezone. */
export function localHourOf(utcIso: string, timeZone: string): number {
  const zoned = toZonedTime(new Date(utcIso), timeZone);
  return zoned.getHours();
}

/** Local calendar date (yyyy-MM-dd) of a UTC timestamp in the given timezone. */
export function localDateOf(utcIso: string, timeZone: string): string {
  return formatInTimeZone(new Date(utcIso), timeZone, "yyyy-MM-dd");
}

/**
 * How many local hours a given local calendar date actually has in this
 * timezone: 24 normally, 23 on a "spring forward" DST day, 25 on a "fall
 * back" day. Computed from the actual UTC gap between local midnight and
 * the next local midnight, so it is correct for any timezone/date without
 * a hardcoded DST calendar.
 */
export function hoursInLocalDay(localDateStr: string, timeZone: string): number {
  const startUtc = fromZonedTime(`${localDateStr}T00:00:00`, timeZone);
  const nextDate = addDaysToDateString(localDateStr, 1);
  const endUtc = fromZonedTime(`${nextDate}T00:00:00`, timeZone);
  const hours = (endUtc.getTime() - startUtc.getTime()) / (1000 * 60 * 60);
  return Math.round(hours);
}

export function isDstTransitionDay(localDateStr: string, timeZone: string): boolean {
  return hoursInLocalDay(localDateStr, timeZone) !== 24;
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
