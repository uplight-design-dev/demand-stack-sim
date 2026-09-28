import type { Provenance } from "../../../shared/types/energy.js";
import type { UtilityRateOptions } from "../../../shared/types/rates.js";

export interface FetchUtilityRatesParams {
  eiaid: number;
  /** Exact URDB `utility` name -- required because a single eiaid can carry rate filings for more than one state-specific legal entity name (confirmed live: eiaid 19876 returns both "Virginia Electric & Power Co" and "Virginia Electric & Power Co (North Carolina)" rows; filtering by eiaid alone would silently mix in the wrong state's tariffs). */
  utilityName: string;
  state: string;
  sector: string;
}

export interface RateAdapterResult {
  data: UtilityRateOptions;
  provenance: Provenance;
}

/** Source-agnostic interface for rate-schedule data, mirroring EnergyDataAdapter's discipline: URDB is the first (and so far only) implementation, but nothing above this layer should know URDB field names exist. */
export interface RateDataAdapter {
  readonly sourceName: "URDB" | "DEMO";
  fetchUtilityRates(params: FetchUtilityRatesParams): Promise<RateAdapterResult>;
}
