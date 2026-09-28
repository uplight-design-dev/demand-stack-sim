// Normalized rate-schedule data model, sourced from the OpenEI Utility Rate
// Database (URDB) via UrdbDataAdapter. Mirrors the discipline in
// shared/types/energy.ts: a source-specific adapter maps raw API fields into
// this shape, and nothing downstream of the adapter layer should know URDB
// field names (energyratestructure, energyweekdayschedule, ...) exist.

/** One usage tier within a rate period. `max` is the tier's upper usage bound (kWh); the last tier in a period has none. */
export interface RateTier {
  /** Upper bound of this tier, in the period's `unit` (usually kWh). Undefined = no cap (top tier). */
  max?: number;
  unit: string;
  /** Base energy rate, USD per kWh, as URDB reports it. */
  rateUsdPerKwh: number;
  /** Additional adjustment (e.g. rider/surcharge), USD per kWh, as URDB reports it. */
  adjUsdPerKwh: number;
  /** rateUsdPerKwh + adjUsdPerKwh -- the number that actually determines what a customer pays. */
  effectiveUsdPerKwh: number;
}

export type RatePeriodKind = "on_peak" | "mid_peak" | "off_peak" | "flat";

/** One energy-rate "period" (URDB's term) -- a named block of the day/season with its own tier structure. */
export interface RatePeriod {
  /** URDB's period index (0-based), as referenced by the weekday/weekend schedule matrices. */
  periodIndex: number;
  /** Derived by comparing this period's lowest-tier effective rate against the schedule's other periods. */
  kind: RatePeriodKind;
  tiers: RateTier[];
  /** The tier customers actually land on for typical usage -- the first (lowest) tier's effective rate. */
  representativeUsdPerKwh: number;
}

/** One tier within a demand (per-kW) charge period, mirroring RateTier. */
export interface DemandTier {
  max?: number;
  unit: string;
  rateUsdPerKw: number;
  adjUsdPerKw: number;
  effectiveUsdPerKw: number;
}

export interface DemandPeriod {
  periodIndex: number;
  tiers: DemandTier[];
  representativeUsdPerKw: number;
}

/**
 * A normalized rate schedule. `weekdaySchedule`/`weekendSchedule` are
 * 12 (month, 0=Jan) x 24 (local hour, 0-23) matrices of period indices,
 * exactly mirroring URDB's own energyweekdayschedule/energyweekendschedule
 * shape -- this is the structure the app needs to answer "what period is
 * hour H on weekday/weekend in month M in," including non-contiguous or
 * seasonally-varying peak windows that a single start/end hour cannot
 * represent (e.g. Dominion's TOU rate has two separate on-peak blocks/day).
 */
export interface RateSchedule {
  /** URDB's own opaque id for this exact rate version ("label" field). */
  id: string;
  name: string;
  utilityName: string;
  /** EIA utility id (retail-utility id space, not a balancing-authority id -- see docs). */
  eiaid: number;
  sector: "Residential" | "Commercial" | "Industrial" | string;
  isDefault: boolean;
  approved: boolean;
  /** ISO date the rate took effect. */
  startDate: string | null;
  /** ISO date the rate stopped applying, or null if it is currently active. */
  endDate: string | null;
  hasTimeOfUse: boolean;
  hasDemandCharge: boolean;
  periods: RatePeriod[];
  weekdaySchedule: number[][];
  weekendSchedule: number[][];
  demandPeriods?: DemandPeriod[];
  demandWeekdaySchedule?: number[][];
  demandWeekendSchedule?: number[][];
  fixedChargeUsd?: number;
  fixedChargeUnits?: string;
  minChargeUsd?: number;
  /** Tariff document URL(s), when URDB has them, for the "go verify this" Level 3 use case. */
  sourceUrl?: string;
  sourceParentUrl?: string;
}

/** Everything the app has for one utility+sector: the standard default rate plus any other currently-active, approved alternatives (e.g. an opt-in TOU rate). */
export interface UtilityRateOptions {
  utilityName: string;
  eiaid: number;
  state: string;
  sector: RateSchedule["sector"];
  defaultSchedule: RateSchedule | null;
  alternativeSchedules: RateSchedule[];
  /**
   * Data-quality notes, e.g. "default_inferred_not_source_flagged" when URDB
   * did not mark any currently-active schedule is_default=true and this app
   * inferred the standard schedule by name instead (confirmed live: URDB's
   * own is_default flag is simply absent on every Dominion Virginia
   * residential rate as of 2026-09-27 -- a real source data-quality gap,
   * not a bug in this app).
   */
  qualityFlags: string[];
}
