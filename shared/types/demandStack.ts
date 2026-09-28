// Demand Stack calculation contract. The definitive stack order is fixed:
// 1. Energy Efficiency (blue)  2. Rates & Behavior (green)  3. Demand Response (yellow)
// Never reverse this order in UI or calculations.

export type ValueClass = "observed" | "assumed" | "calculated";

export interface EfficiencyAssumptions {
  enabled: boolean;
  /** Persistent reduction as a percent of baseline, 0-100 */
  reductionPercent: number;
}

export interface RatesAssumptions {
  enabled: boolean;
  /** Local hour range, inclusive, that defines the "peak window" being targeted */
  peakWindowStartHour: number; // 0-23
  peakWindowEndHour: number; // 0-23
  /**
   * Optional explicit set of local peak hours (0-23, any order/length),
   * overriding peakWindowStartHour/peakWindowEndHour when present and
   * non-empty. Additive, backward-compatible: existing callers that only
   * set the start/end hour fields are unaffected. Needed because a real
   * utility TOU rate's on-peak window is not always one contiguous range --
   * e.g. Dominion Energy Virginia's residential TOU rate has two separate
   * on-peak blocks per weekday (confirmed live via the URDB rate-schedules
   * integration, see server/lib/rates/). Populated when a real rate is
   * applied from the Rate Explorer; left unset for the manual/assumed
   * peak-window controls.
   */
  peakHours?: number[];
  /** Percent of demand shifted away from the peak window, 0-100 */
  shiftPercent: number;
  /** If true, shifted energy is not fully restored elsewhere (net conservation effect) */
  conservationEnabled: boolean;
  conservationPercent: number; // 0-100, only used if conservationEnabled
}

export interface DemandResponseAssumptions {
  enabled: boolean;
  eventStartHour: number; // 0-23 local
  durationHours: number; // 1-8
  /** Share of technical DR capacity assumed to participate, 0-100 */
  participationPercent: number;
  /** Assumed performance vs nameplate capacity, 0-100 */
  performancePercent: number;
  /** Technical capacity available for dispatch, MW (from DER/program assumptions) */
  availableCapacityMw: number;
}

export interface DemandStackAssumptions {
  efficiency: EfficiencyAssumptions;
  rates: RatesAssumptions;
  demandResponse: DemandResponseAssumptions;
}

export interface HourlyStackResult {
  hour: number;
  baselineMw: number;
  efficiencyReductionMw: number;
  ratesAdjustmentMw: number; // negative = shifted away, positive = shifted in
  demandResponseReductionMw: number;
  resultingLoadMw: number;
}

export interface LayerContribution {
  layer: "efficiency" | "rates" | "demandResponse";
  peakReductionMw: number;
  energyImpactMwh: number;
  valueClass: ValueClass;
  assumptionSummary: string;
}

export interface DemandStackResults {
  hourly: HourlyStackResult[];
  originalPeakMw: number;
  originalPeakHour: number;
  resultingPeakMw: number;
  resultingPeakHour: number;
  peakReductionMw: number;
  peakReductionPercent: number;
  energyReducedMwh: number;
  energyShiftedMwh: number;
  eventDurationHours: number;
  contributions: LayerContribution[];
  qualityStatus: string;
}
