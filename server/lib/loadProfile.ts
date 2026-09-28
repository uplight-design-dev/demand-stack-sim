import type {
  HourlyPoint,
  LoadProfile,
  LoadProfileSummary,
  NormalizedEnergyRecord,
  ProfileType
} from "../../shared/types/energy.js";
import { hoursInLocalDay, localDateOf, localHourOf, utcToLocalIso } from "./timezone.js";

/** Fills timestampLocal on records where the adapter left it blank (EIA rows). */
export function fillLocalTimestamps(records: NormalizedEnergyRecord[], timezone: string): NormalizedEnergyRecord[] {
  return records.map((r) =>
    r.timestampLocal ? r : { ...r, timestampLocal: utcToLocalIso(r.timestampUtc, timezone) }
  );
}

function localDateKey(r: NormalizedEnergyRecord, timezone: string): string {
  return localDateOf(r.timestampUtc, timezone);
}

export function groupByLocalDate(
  records: NormalizedEnergyRecord[],
  timezone: string
): Map<string, NormalizedEnergyRecord[]> {
  const map = new Map<string, NormalizedEnergyRecord[]>();
  for (const r of records) {
    const key = localDateKey(r, timezone);
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return map;
}

function toPoints(records: NormalizedEnergyRecord[], timezone: string): HourlyPoint[] {
  return [...records]
    .sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))
    .map((r) => ({
      hourLocal: r.timestampLocal,
      hourUtc: r.timestampUtc,
      hour: localHourOf(r.timestampUtc, timezone),
      value: r.value
    }));
}

function summarize(
  points: HourlyPoint[],
  timezone: string,
  profileDate: string,
  sourceDaysUsed: number,
  expectedHours: number
): LoadProfileSummary {
  if (points.length === 0) {
    return {
      peakMw: 0,
      peakHourLocal: "",
      minMw: 0,
      avgMw: 0,
      dailyEnergyMwh: 0,
      peakToAverageRatio: 0,
      profileDate,
      sourceDaysUsed,
      missingHourCount: expectedHours,
      isDstTransitionDay: false,
      hoursInDay: 0
    };
  }
  const values = points.map((p) => p.value);
  const peakMw = Math.max(...values);
  const minMw = Math.min(...values);
  const avgMw = values.reduce((a, b) => a + b, 0) / values.length;
  const peakPoint = points.find((p) => p.value === peakMw)!;
  const hoursInDay = expectedHours;
  const dailyEnergyMwh = avgMw * points.length; // MW average * hours = MWh, correct even for 23/25-hr days
  const isDst = sourceDaysUsed === 1 && hoursInDay !== 24;

  return {
    peakMw: round2(peakMw),
    peakHourLocal: peakPoint.hourLocal,
    minMw: round2(minMw),
    avgMw: round2(avgMw),
    dailyEnergyMwh: round2(dailyEnergyMwh),
    peakToAverageRatio: round2(peakMw / avgMw),
    profileDate,
    sourceDaysUsed,
    missingHourCount: Math.max(0, expectedHours - points.length),
    isDstTransitionDay: isDst,
    hoursInDay
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isWeekend(localDateStr: string): boolean {
  const [y, m, d] = localDateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

function monthOf(localDateStr: string): number {
  return Number(localDateStr.slice(5, 7));
}

/** Builds a LoadProfile for a single explicit local calendar date. */
export function buildCustomDateProfile(
  allRecords: NormalizedEnergyRecord[],
  timezone: string,
  localDate: string,
  regionId: string,
  regionName: string,
  metric: LoadProfile["metric"]
): LoadProfile {
  const byDate = groupByLocalDate(allRecords, timezone);
  const dayRecords = byDate.get(localDate) ?? [];
  const points = toPoints(dayRecords, timezone);
  const expectedHours = hoursInLocalDay(localDate, timezone);
  return {
    regionId,
    regionName,
    regionType: dayRecords[0]?.regionType ?? "balancing_authority",
    timezone,
    metric,
    profileType: "custom_date",
    points,
    summary: summarize(points, timezone, localDate, points.length > 0 ? 1 : 0, expectedHours)
  };
}

/** Finds the single highest-demand local day in the dataset and returns its 24(ish)-hour profile. */
export function buildPeakDayProfile(
  allRecords: NormalizedEnergyRecord[],
  timezone: string,
  regionId: string,
  regionName: string,
  metric: LoadProfile["metric"]
): LoadProfile {
  const byDate = groupByLocalDate(allRecords, timezone);
  let peakDate = "";
  let peakValue = -Infinity;
  for (const [date, recs] of byDate) {
    const max = Math.max(...recs.map((r) => r.value));
    if (max > peakValue) {
      peakValue = max;
      peakDate = date;
    }
  }
  if (!peakDate) {
    return emptyProfile(regionId, regionName, timezone, metric, "peak_day");
  }
  return buildCustomDateProfile(allRecords, timezone, peakDate, regionId, regionName, metric);
}

/**
 * Typical weekday for a season: averages each local hour-of-day across all
 * full (24-hour) weekdays in the season window. DST-transition days are
 * excluded from the average by design (a 23/25-hour day cannot be averaged
 * hour-for-hour against 24-hour days without distorting the shape) -- this
 * exclusion is recorded in the returned summary via sourceDaysUsed being
 * smaller than the season's total weekday count.
 */
export function buildTypicalWeekdayProfile(
  allRecords: NormalizedEnergyRecord[],
  timezone: string,
  regionId: string,
  regionName: string,
  metric: LoadProfile["metric"],
  season: "summer" | "winter"
): LoadProfile {
  const seasonMonths = season === "summer" ? [6, 7, 8] : [12, 1, 2];
  const byDate = groupByLocalDate(allRecords, timezone);

  const eligibleDays: string[] = [];
  for (const [date, recs] of byDate) {
    if (!seasonMonths.includes(monthOf(date))) continue;
    if (isWeekend(date)) continue;
    if (hoursInLocalDay(date, timezone) !== 24) continue;
    if (recs.length !== 24) continue; // incomplete day, skip from the average
    eligibleDays.push(date);
  }

  const hourSums = new Array(24).fill(0);
  const hourCounts = new Array(24).fill(0);
  let anyLocalTs = "";
  for (const date of eligibleDays) {
    for (const r of byDate.get(date)!) {
      const hour = localHourOf(r.timestampUtc, timezone);
      hourSums[hour] += r.value;
      hourCounts[hour]++;
      anyLocalTs = r.timestampLocal;
    }
  }

  const points: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] === 0) continue;
    const sampleTs = anyLocalTs.slice(0, 10);
    points.push({
      hourLocal: `${sampleTs}T${String(h).padStart(2, "0")}:00:00`,
      hourUtc: "",
      hour: h,
      value: hourSums[h] / hourCounts[h]
    });
  }

  const label = `Typical ${season} weekday (average of ${eligibleDays.length} days)`;
  return {
    regionId,
    regionName,
    regionType: "balancing_authority",
    timezone,
    metric,
    profileType: season === "summer" ? "typical_summer_weekday" : "typical_winter_weekday",
    points,
    summary: summarize(points, timezone, label, eligibleDays.length, 24)
  };
}

export function buildDateRangeAverageProfile(
  allRecords: NormalizedEnergyRecord[],
  timezone: string,
  regionId: string,
  regionName: string,
  metric: LoadProfile["metric"],
  startLocal: string,
  endLocal: string
): LoadProfile {
  const byDate = groupByLocalDate(allRecords, timezone);
  const days = [...byDate.keys()].filter((d) => d >= startLocal && d <= endLocal && hoursInLocalDay(d, timezone) === 24 && byDate.get(d)!.length === 24);

  const hourSums = new Array(24).fill(0);
  const hourCounts = new Array(24).fill(0);
  for (const date of days) {
    for (const r of byDate.get(date)!) {
      const hour = localHourOf(r.timestampUtc, timezone);
      hourSums[hour] += r.value;
      hourCounts[hour]++;
    }
  }
  const points: HourlyPoint[] = [];
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] === 0) continue;
    points.push({
      hourLocal: `${startLocal}T${String(h).padStart(2, "0")}:00:00`,
      hourUtc: "",
      hour: h,
      value: hourSums[h] / hourCounts[h]
    });
  }

  const label = `${startLocal} to ${endLocal} average (${days.length} days)`;
  return {
    regionId,
    regionName,
    regionType: "balancing_authority",
    timezone,
    metric,
    profileType: "date_range_average",
    points,
    summary: summarize(points, timezone, label, days.length, 24)
  };
}

function emptyProfile(
  regionId: string,
  regionName: string,
  timezone: string,
  metric: LoadProfile["metric"],
  profileType: ProfileType
): LoadProfile {
  return {
    regionId,
    regionName,
    regionType: "balancing_authority",
    timezone,
    metric,
    profileType,
    points: [],
    summary: summarize([], timezone, "no data", 0, 24)
  };
}
