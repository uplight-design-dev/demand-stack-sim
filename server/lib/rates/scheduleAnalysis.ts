import type {
  DemandPeriod,
  DemandTier,
  RatePeriod,
  RatePeriodKind,
  RateSchedule,
  RateTier,
  UtilityRateOptions
} from "../../../shared/types/rates.js";

/**
 * Raw URDB (OpenEI Utility Rate Database) rate object, as returned by
 * GET https://api.openei.org/utility_rates with detail=full. Only the
 * fields this app actually uses are declared; URDB returns many more
 * (net metering, coincident-peak demand structures, fuel adjustments,
 * ...) that are deliberately out of scope for this MVP.
 */
export interface UrdbTierRaw {
  max?: number;
  unit?: string;
  rate?: number;
  adj?: number;
}

export interface UrdbRateRaw {
  label: string;
  utility: string;
  eiaid: number;
  name: string;
  sector: string;
  approved?: boolean;
  is_default?: boolean;
  startdate?: number; // unix seconds
  enddate?: number | null;
  supersedes?: string;
  energyratestructure?: UrdbTierRaw[][];
  energyweekdayschedule?: number[][];
  energyweekendschedule?: number[][];
  demandratestructure?: UrdbTierRaw[][];
  demandweekdayschedule?: number[][];
  demandweekendschedule?: number[][];
  fixedchargefirstmeter?: number;
  fixedchargeunits?: string;
  mincharge?: number;
  source?: string;
  sourceparent?: string;
}

function unixToIso(seconds: number | undefined | null): string | null {
  if (seconds === undefined || seconds === null) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function normalizeEnergyTier(t: UrdbTierRaw): RateTier {
  const rate = t.rate ?? 0;
  const adj = t.adj ?? 0;
  return {
    max: t.max,
    unit: t.unit ?? "kWh",
    rateUsdPerKwh: rate,
    adjUsdPerKwh: adj,
    effectiveUsdPerKwh: round6(rate + adj)
  };
}

function normalizeDemandTier(t: UrdbTierRaw): DemandTier {
  const rate = t.rate ?? 0;
  const adj = t.adj ?? 0;
  return {
    max: t.max,
    unit: t.unit ?? "kW",
    rateUsdPerKw: rate,
    adjUsdPerKw: adj,
    effectiveUsdPerKw: round6(rate + adj)
  };
}

/**
 * A period's "representative" rate is its lowest (first) tier's effective
 * rate -- the price a typical customer actually pays before crossing into a
 * higher usage tier. Simplifying assumption, documented on RateSchedule's
 * consumers: this app does not model tiered-usage accumulation.
 */
function representativeRate(tiers: RateTier[]): number {
  return tiers.length > 0 ? tiers[0].effectiveUsdPerKwh : 0;
}

function representativeDemandRate(tiers: DemandTier[]): number {
  return tiers.length > 0 ? tiers[0].effectiveUsdPerKw : 0;
}

/**
 * Classifies each period as on/mid/off-peak by ranking its representative
 * rate against the schedule's other periods. A schedule with only one period
 * is "flat" -- there's no peak/off-peak distinction to draw. This is a
 * relative classification (URDB does not label periods "peak" itself), so it
 * only ever compares periods within the same schedule.
 */
function classifyPeriods(periods: Array<{ periodIndex: number; representativeUsdPerKwh: number }>): Map<number, RatePeriodKind> {
  const kinds = new Map<number, RatePeriodKind>();
  if (periods.length <= 1) {
    for (const p of periods) kinds.set(p.periodIndex, "flat");
    return kinds;
  }
  const rates = [...new Set(periods.map((p) => p.representativeUsdPerKwh))].sort((a, b) => a - b);
  const min = rates[0];
  const max = rates[rates.length - 1];
  for (const p of periods) {
    if (p.representativeUsdPerKwh >= max) kinds.set(p.periodIndex, "on_peak");
    else if (p.representativeUsdPerKwh <= min) kinds.set(p.periodIndex, "off_peak");
    else kinds.set(p.periodIndex, "mid_peak");
  }
  return kinds;
}

/**
 * True only when at least one representative day (a single month's weekday
 * or weekend 24-value row) itself references more than one period index --
 * i.e. price genuinely changes at some point *within* a day. A schedule
 * that only changes period by season (e.g. a flat summer rate and a
 * different flat winter rate, each constant across all 24 hours) is NOT
 * time-of-use by this definition, even though its weekday/weekend matrix as
 * a whole contains more than one distinct value across the year. Confirmed
 * against real data: Dominion VA's standard "Residential Schedule 1" is
 * exactly this seasonal-but-flat shape and must not be classified as TOU.
 */
function scheduleVariesByHour(weekday?: number[][], weekend?: number[][]): boolean {
  const rows = [...(weekday ?? []), ...(weekend ?? [])];
  return rows.some((row) => new Set(row).size > 1);
}

export function normalizeRateSchedule(raw: UrdbRateRaw): RateSchedule {
  const energyStructure = raw.energyratestructure ?? [];
  const periods: RatePeriod[] = energyStructure.map((tiers, periodIndex) => {
    const normTiers = tiers.map(normalizeEnergyTier);
    return {
      periodIndex,
      kind: "flat", // filled in below once we know every period's rate
      tiers: normTiers,
      representativeUsdPerKwh: representativeRate(normTiers)
    };
  });
  const hasTimeOfUse =
    periods.length > 1 && scheduleVariesByHour(raw.energyweekdayschedule, raw.energyweekendschedule);

  // Only classify periods as on/off/mid-peak when the schedule genuinely
  // varies by hour of day. A schedule with several periods that only
  // change by season (e.g. a flat summer rate and a different flat winter
  // rate) has no "peak window" to speak of -- every period is "flat",
  // even though there's more than one of them. Confirmed against real
  // data: Dominion VA's standard residential rate is exactly this shape.
  if (hasTimeOfUse) {
    const kinds = classifyPeriods(periods);
    for (const p of periods) p.kind = kinds.get(p.periodIndex) ?? "flat";
  }

  const demandStructure = raw.demandratestructure ?? [];
  const hasDemandCharge = demandStructure.length > 0 && demandStructure.some((tiers) => tiers.some((t) => (t.rate ?? 0) > 0));
  const demandPeriods: DemandPeriod[] | undefined = hasDemandCharge
    ? demandStructure.map((tiers, periodIndex) => {
        const normTiers = tiers.map(normalizeDemandTier);
        return { periodIndex, tiers: normTiers, representativeUsdPerKw: representativeDemandRate(normTiers) };
      })
    : undefined;

  return {
    id: raw.label,
    name: raw.name,
    utilityName: raw.utility,
    eiaid: raw.eiaid,
    sector: raw.sector as RateSchedule["sector"],
    isDefault: Boolean(raw.is_default),
    approved: Boolean(raw.approved),
    startDate: unixToIso(raw.startdate),
    endDate: unixToIso(raw.enddate ?? null),
    hasTimeOfUse,
    hasDemandCharge,
    periods,
    weekdaySchedule: raw.energyweekdayschedule ?? [],
    weekendSchedule: raw.energyweekendschedule ?? [],
    demandPeriods,
    demandWeekdaySchedule: hasDemandCharge ? raw.demandweekdayschedule : undefined,
    demandWeekendSchedule: hasDemandCharge ? raw.demandweekendschedule : undefined,
    fixedChargeUsd: raw.fixedchargefirstmeter,
    fixedChargeUnits: raw.fixedchargeunits,
    minChargeUsd: raw.mincharge,
    sourceUrl: raw.source,
    sourceParentUrl: raw.sourceparent
  };
}

/**
 * A rate is "currently active" (URDB retains every historical version of a
 * rate forever) when it has no end date. Confirmed via live testing: a naive
 * query otherwise returns years of expired tariffs mixed in with the current
 * one.
 */
export function isCurrentlyActive(raw: UrdbRateRaw): boolean {
  return raw.enddate === null || raw.enddate === undefined;
}

// Rate names that flag a niche/opt-in specialty tariff rather than the
// utility's standard/general residential rate -- used only as a fallback
// when URDB has not flagged any candidate is_default=true (confirmed via
// live testing: URDB's is_default field is simply absent on every Virginia
// Electric & Power Co residential rate as of 2026-09-27, a real source
// data-quality gap, not a bug in this app). This is a heuristic, applied
// only to break that tie, and every schedule it selects is still real URDB
// data -- never fabricated.
const SPECIALTY_NAME_PATTERN =
  /experimental|electric vehicle|\bev\b|water heating|time.controlled|off-peak plan|time.of.use|\btou\b|demand/i;

/**
 * Picks the single best candidate for "the standard residential rate" from a
 * set of currently-active, approved rates when none is flagged
 * is_default=true. Returns undefined (rather than guessing) when there
 * isn't exactly one clear non-specialty candidate left after excluding
 * TOU/EV/experimental/demand-charge tariffs by name.
 */
export function inferPrimarySchedule(candidates: UrdbRateRaw[]): UrdbRateRaw | undefined {
  const nonSpecialty = candidates.filter((c) => !SPECIALTY_NAME_PATTERN.test(c.name));
  return nonSpecialty.length === 1 ? nonSpecialty[0] : undefined;
}

/**
 * Turns a raw URDB item list (already filtered to one eiaid+utility name)
 * into the normalized UtilityRateOptions this app's routes/UI consume.
 * Shared by UrdbDataAdapter (live) and RateDemoAdapter (frozen fixture) so
 * default-selection logic can't drift between the two.
 */
export function buildUtilityRateOptions(
  rawItems: UrdbRateRaw[],
  params: { eiaid: number; utilityName: string; state: string; sector: string }
): UtilityRateOptions {
  const active = rawItems.filter((r) => isCurrentlyActive(r) && r.approved !== false);
  const qualityFlags: string[] = [];

  if (active.length === 0) {
    return {
      utilityName: params.utilityName,
      eiaid: params.eiaid,
      state: params.state,
      sector: params.sector,
      defaultSchedule: null,
      alternativeSchedules: [],
      qualityFlags: ["no_active_approved_rates_found"]
    };
  }

  let defaultRaw = active.find((r) => r.is_default === true);
  if (!defaultRaw) {
    defaultRaw = inferPrimarySchedule(active);
    if (defaultRaw) {
      qualityFlags.push("default_inferred_not_source_flagged");
    } else {
      qualityFlags.push("no_default_identified");
    }
  }

  const defaultSchedule = defaultRaw ? normalizeRateSchedule(defaultRaw) : null;
  const alternativeSchedules = active
    .filter((r) => r.label !== defaultRaw?.label)
    .map(normalizeRateSchedule)
    // Surface time-of-use alternatives first -- they're the ones with a
    // genuine story to tell in the Rate Explorer UI.
    .sort((a, b) => Number(b.hasTimeOfUse) - Number(a.hasTimeOfUse));

  return {
    utilityName: params.utilityName,
    eiaid: params.eiaid,
    state: params.state,
    sector: params.sector,
    defaultSchedule,
    alternativeSchedules,
    qualityFlags
  };
}

// Rounds to 6 decimal places -- URDB itself reports rates to 5-6 decimal
// places (e.g. 0.076602 $/kWh), so this preserves the source's real
// precision rather than truncating it to something coarser-looking.
function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
