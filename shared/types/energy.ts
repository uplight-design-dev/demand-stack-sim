// Normalized application data model.
// Raw EIA (or CSV/demo) records are converted into this shape by an adapter
// before anything else in the app touches them. Nothing downstream of the
// adapter layer should know EIA series IDs or facet names exist.

export type EnergySource = "EIA" | "CSV" | "DEMO";

export type EnergyMetric =
  | "actual_demand"
  | "forecast_demand"
  | "net_generation"
  | "interchange";

export type RegionType =
  | "state"
  | "balancing_authority"
  | "iso"
  | "rto"
  | "utility"
  | "demo";

export interface NormalizedEnergyRecord {
  source: EnergySource;
  sourceDataset: string;
  seriesId?: string;
  state?: string;
  regionId: string;
  regionName: string;
  regionType: RegionType;
  timezone: string;
  timestampUtc: string;
  timestampLocal: string;
  value: number;
  units: "MW" | "MWh" | string;
  metric: EnergyMetric;
  retrievedAt: string;
  sourceUpdatedAt?: string;
  sourceUrl: string;
  qualityFlags: string[];
}

// ---- State-level overview -------------------------------------------------

export interface StateOverviewMetric {
  metric: "retail_price" | "sales" | "customers" | "revenue";
  sector: "RES" | "COM" | "IND" | "ALL" | "OTH" | "TRA";
  value: number;
  units: string;
  period: string; // e.g. "2025" or "2025-06"
  frequency: "annual" | "quarterly" | "monthly";
}

export interface StateOverview {
  state: string;
  stateName: string;
  metrics: StateOverviewMetric[];
  provenance: Provenance;
  quality: QualityInfo;
}

// ---- Provenance / quality / cache envelope --------------------------------

export interface Provenance {
  source: string;
  dataset: string;
  sourceUrl: string;
  retrievedAt: string;
  sourceUpdatedAt?: string;
}

export type QualityStatus =
  | "complete"
  | "complete_with_warnings"
  | "partial"
  | "stale"
  | "unavailable"
  | "demonstration";

export interface QualityInfo {
  status: QualityStatus;
  flags: string[];
}

export interface CacheInfo {
  status: "fresh" | "stale" | "miss";
}

export interface ApiEnvelope<TData, TSummary = unknown> {
  data: TData;
  summary: TSummary;
  provenance: Provenance;
  quality: QualityInfo;
  cache: CacheInfo;
}

// ---- Geographic registry ---------------------------------------------------

export interface BalancingAuthorityInfo {
  /** EIA "respondent" facet id on electricity/rto/region-data, e.g. "PJM" */
  id: string;
  name: string;
  /** ISO/RTO vs vertically-integrated utility BA, informational only */
  kind: "iso_rto" | "utility" | "federal_power_marketing" | "municipal_or_coop";
  /** States this BA's footprint touches, curated (see geo/balancingAuthorities.ts header) */
  states: string[];
  timezone: string;
  /** true once verified against the EIA facet list itself */
  verifiedAgainstEia: boolean;
  notes?: string;
}

export interface StateInfo {
  name: string;
  abbr: string;
  timezones: string[];
  /** Default/primary timezone to use for single-value display */
  primaryTimezone: string;
}

export interface StateRegionEntry {
  state: StateInfo;
  balancingAuthorities: BalancingAuthorityInfo[];
  defaultBalancingAuthorityId?: string;
  coverage: "hourly_and_state" | "state_only" | "not_yet_mapped";
  geographicNote: string;
  /**
   * True only when this state also has a curated, live-verified default
   * utility in DEFAULT_UTILITY_BY_STATE (server/lib/geo/utilities.ts) --
   * i.e. the Rate Explorer can show real OpenEI URDB tariffs for it, not
   * just EIA load data. A state can have `coverage: "hourly_and_state"`
   * (load data) without `hasRateData` (no verified utility mapping yet).
   * Optional/enriched only at the API boundary (server/routes/regions.ts) --
   * the base geo registry (regionRegistry.ts) deliberately knows nothing
   * about rate-utility mapping, a separate data source.
   */
  hasRateData?: boolean;
  /** The curated default utility's display name, only when hasRateData is true. */
  defaultUtilityName?: string;
}

// ---- Load profile ------------------------------------------------------------

export type ProfileType =
  | "peak_day"
  | "typical_summer_weekday"
  | "typical_winter_weekday"
  | "custom_date"
  | "date_range_average";

export interface HourlyPoint {
  hourLocal: string; // ISO local timestamp, e.g. 2025-07-14T14:00:00-04:00
  hourUtc: string;
  hour: number; // 0-23, local
  value: number; // MW
}

export interface LoadProfileSummary {
  peakMw: number;
  peakHourLocal: string;
  minMw: number;
  avgMw: number;
  dailyEnergyMwh: number;
  peakToAverageRatio: number;
  profileDate: string; // representative date or range label
  sourceDaysUsed: number;
  missingHourCount: number;
  isDstTransitionDay: boolean;
  hoursInDay: number; // 23, 24, or 25
}

export interface LoadProfile {
  regionId: string;
  regionName: string;
  regionType: RegionType;
  timezone: string;
  metric: EnergyMetric;
  profileType: ProfileType;
  points: HourlyPoint[];
  summary: LoadProfileSummary;
}
