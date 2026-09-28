import type { NormalizedEnergyRecord } from "../../shared/types/energy.js";
import { utcToLocalIso } from "./timezone.js";

/**
 * Deterministic, clearly-labeled demonstration dataset. Used when
 * ENERGY_DATA_ADAPTER=demo, when no EIA_API_KEY is configured, or as a
 * fallback when EIA is unavailable. Shaped loosely after the winter-peaking
 * utility profile documented in this project's prior workbook discovery
 * pass (annual peak in January evening, near-twin summer peak in June),
 * but the numbers are synthetic -- never presented as EIA data.
 */

const DEMO_REGION_ID = "DEMO-UTIL";
const DEMO_REGION_NAME = "Demonstration Utility (synthetic)";
const DEMO_TIMEZONE = "America/New_York";
const DEMO_SOURCE_URL = "https://www.eia.gov/opendata/ (demonstration data, not a live EIA request)";

// Small seeded PRNG so demo data is reproducible across requests/tests.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hourlyShape(hourOfDay: number): number {
  // Two humps: morning rise, evening peak around 6-7pm.
  const morning = Math.exp(-((hourOfDay - 9) ** 2) / 18) * 0.35;
  const evening = Math.exp(-((hourOfDay - 18) ** 2) / 10) * 0.65;
  const base = 0.55;
  return base + morning + evening;
}

function seasonalFactor(dayOfYear: number): number {
  // Winter peak (~day 23, Jan) and near-twin summer peak (~day 175, Jun).
  const winter = Math.exp(-((dayOfYear - 23) ** 2) / (2 * 25 ** 2)) * 0.32;
  const summer = Math.exp(-((dayOfYear - 175) ** 2) / (2 * 35 ** 2)) * 0.3;
  return 0.68 + winter + summer;
}

/** Generates a full synthetic year of hourly demand for the demo region. */
export function generateDemoYear(year: number): NormalizedEnergyRecord[] {
  const rand = mulberry32(year);
  const records: NormalizedEnergyRecord[] = [];
  const peakTargetMw = 24_678; // matches the discovery-pass reference peak, for continuity

  const start = Date.UTC(year, 0, 1, 0, 0, 0);
  const hours = isLeapYear(year) ? 8784 : 8760;

  for (let h = 0; h < hours; h++) {
    const utcDate = new Date(start + h * 3_600_000);
    const localIso = utcToLocalIso(utcDate.toISOString(), DEMO_TIMEZONE);
    const localHour = Number(localIso.slice(11, 13));
    const dayOfYear = Math.floor(
      (utcDate.getTime() - Date.UTC(year, 0, 1)) / 86_400_000
    );
    const localDow = new Date(`${localIso.slice(0, 10)}T00:00:00Z`).getUTCDay();
    const weekdayFactor = localDow === 0 || localDow === 6 ? 0.9 : 1.0;

    const noise = 1 + (rand() - 0.5) * 0.02;
    const shape = hourlyShape(localHour) * seasonalFactor(dayOfYear) * weekdayFactor * noise;
    // hourlyShape * seasonalFactor peaks at roughly 1.21 (evening hour on the
    // coldest winter day); this constant renormalizes so the generated
    // annual peak lands close to peakTargetMw, matching the code comment.
    const value = Math.round(shape * peakTargetMw * 0.825 * 100) / 100;

    records.push({
      source: "DEMO",
      sourceDataset: "demo-synthetic-hourly",
      state: undefined,
      regionId: DEMO_REGION_ID,
      regionName: DEMO_REGION_NAME,
      regionType: "demo",
      timezone: DEMO_TIMEZONE,
      timestampUtc: utcDate.toISOString(),
      timestampLocal: localIso,
      value,
      units: "MW",
      metric: "actual_demand",
      retrievedAt: new Date().toISOString(),
      sourceUrl: DEMO_SOURCE_URL,
      qualityFlags: ["demonstration_data"]
    });
  }

  return records;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export const DEMO_META = {
  regionId: DEMO_REGION_ID,
  regionName: DEMO_REGION_NAME,
  timezone: DEMO_TIMEZONE,
  sourceUrl: DEMO_SOURCE_URL
};
