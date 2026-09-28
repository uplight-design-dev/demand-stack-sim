import type {
  EnergyMetric,
  EnergySource,
  NormalizedEnergyRecord,
  Provenance,
  StateOverview
} from "../../../shared/types/energy.js";

export interface FetchHourlyParams {
  /** Balancing-authority id (e.g. "PJM") or the demo region id. */
  regionId: string;
  regionName: string;
  timezone: string;
  /** Inclusive UTC bounds, "YYYY-MM-DDTHH" or "YYYY-MM-DD". */
  startUtc: string;
  endUtc: string;
  metric?: EnergyMetric;
}

export interface AdapterFetchResult<T> {
  records: T[];
  provenance: Provenance;
}

/**
 * Source-agnostic interface. EIA is the first implementation but not the
 * only one -- a LocalCsvAdapter or another provider (NREL, EPA eGRID, an
 * ISO/RTO feed, a utility filing) can implement this same contract without
 * any change to routes, calculations, or UI.
 */
export interface EnergyDataAdapter {
  readonly sourceName: EnergySource;
  fetchHourlyDemand(params: FetchHourlyParams): Promise<AdapterFetchResult<NormalizedEnergyRecord>>;
  fetchStateOverview(stateAbbr: string, stateName: string, year: string): Promise<StateOverview>;
}
