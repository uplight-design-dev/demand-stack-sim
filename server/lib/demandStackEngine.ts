import type {
  DemandStackAssumptions,
  DemandStackResults,
  HourlyStackResult,
  LayerContribution
} from "../../shared/types/demandStack.js";

/**
 * V1 Demand Stack calculation engine. Order is fixed and load-bearing:
 * Efficiency is applied first (persistent), then Rates & Behavior (shifts
 * load within the day), then Demand Response (a temporary event-window
 * reduction) -- each layer acts on what's left after the layer before it,
 * matching the definitive blue -> green -> yellow stack order. The result
 * is clamped so it can never go negative, and every reduction reported is
 * the amount actually applied (post-clamp), never the raw requested amount.
 */
export function simulateDemandStack(
  baselineMw: number[], // 24 values, local hour 0-23
  assumptions: DemandStackAssumptions
): DemandStackResults {
  if (baselineMw.length !== 24) {
    throw new Error(`simulateDemandStack expects 24 hourly baseline values, got ${baselineMw.length}`);
  }

  const hourly: HourlyStackResult[] = baselineMw.map((baseline, hour) => ({
    hour,
    baselineMw: baseline,
    efficiencyReductionMw: 0,
    ratesAdjustmentMw: 0,
    demandResponseReductionMw: 0,
    resultingLoadMw: baseline
  }));

  applyEfficiency(hourly, assumptions.efficiency);
  applyRates(hourly, assumptions.rates);
  applyDemandResponse(hourly, assumptions.demandResponse);

  for (const h of hourly) {
    const raw =
      h.baselineMw - h.efficiencyReductionMw + h.ratesAdjustmentMw - h.demandResponseReductionMw;
    h.resultingLoadMw = Math.max(0, round2(raw));
  }

  return buildResults(hourly, assumptions);
}

function applyEfficiency(hourly: HourlyStackResult[], eff: DemandStackAssumptions["efficiency"]): void {
  if (!eff.enabled) return;
  const pct = clampPercent(eff.reductionPercent);
  for (const h of hourly) {
    h.efficiencyReductionMw = round2(h.baselineMw * (pct / 100));
  }
}

function applyRates(hourly: HourlyStackResult[], rates: DemandStackAssumptions["rates"]): void {
  if (!rates.enabled) return;
  const shiftPct = clampPercent(rates.shiftPercent);
  const conservePct = rates.conservationEnabled ? clampPercent(rates.conservationPercent) : 0;
  // A real rate's on-peak window is not always one contiguous range (e.g.
  // two separate blocks/day) -- when peakHours is supplied, it is the
  // source of truth and overrides the single start/end range entirely.
  const windowHours =
    rates.peakHours && rates.peakHours.length > 0
      ? [...new Set(rates.peakHours.map((h) => ((h % 24) + 24) % 24))]
      : hourRange(rates.peakWindowStartHour, rates.peakWindowEndHour);
  const offPeakHours = hourly.map((h) => h.hour).filter((h) => !windowHours.includes(h));
  if (offPeakHours.length === 0) return;

  let totalRemoved = 0;
  for (const h of hourly) {
    if (!windowHours.includes(h.hour)) continue;
    const postEfficiency = h.baselineMw - h.efficiencyReductionMw;
    const removed = round2(postEfficiency * (shiftPct / 100));
    h.ratesAdjustmentMw = -removed;
    totalRemoved += removed;
  }

  const redistributable = totalRemoved * (1 - conservePct / 100);
  if (redistributable <= 0) return;

  // Redistribute proportional to each off-peak hour's share of off-peak baseline,
  // so the shifted load lands where demand already runs higher rather than as a flat spike.
  const offPeakBaselineTotal = offPeakHours.reduce((sum, hr) => {
    const rec = hourly[hr];
    return sum + Math.max(0.0001, rec.baselineMw - rec.efficiencyReductionMw);
  }, 0);

  for (const hr of offPeakHours) {
    const rec = hourly[hr];
    const share = Math.max(0.0001, rec.baselineMw - rec.efficiencyReductionMw) / offPeakBaselineTotal;
    rec.ratesAdjustmentMw = round2(rec.ratesAdjustmentMw + redistributable * share);
  }
}

function applyDemandResponse(hourly: HourlyStackResult[], dr: DemandStackAssumptions["demandResponse"]): void {
  if (!dr.enabled) return;
  const participation = clampPercent(dr.participationPercent);
  const performance = clampPercent(dr.performancePercent);
  const dispatchedMw = Math.max(0, dr.availableCapacityMw) * (participation / 100) * (performance / 100);
  const hoursSet = new Set(consecutiveHours(dr.eventStartHour, dr.durationHours));

  for (const h of hourly) {
    if (!hoursSet.has(h.hour)) continue;
    const availableBeforeDr = h.baselineMw - h.efficiencyReductionMw + h.ratesAdjustmentMw;
    h.demandResponseReductionMw = round2(Math.min(dispatchedMw, Math.max(0, availableBeforeDr)));
  }
}

function consecutiveHours(start: number, duration: number): number[] {
  const dur = Math.max(0, Math.min(8, Math.round(duration)));
  const hours: number[] = [];
  for (let i = 0; i < dur; i++) hours.push((start + i) % 24);
  return hours;
}

function describePeakWindow(rates: DemandStackAssumptions["rates"]): string {
  if (rates.peakHours && rates.peakHours.length > 0) {
    const sorted = [...new Set(rates.peakHours.map((h) => ((h % 24) + 24) % 24))].sort((a, b) => a - b);
    return `hours ${sorted.map((h) => `${h}:00`).join(", ")} (real rate on-peak hours)`;
  }
  return `hours ${rates.peakWindowStartHour}:00-${rates.peakWindowEndHour}:00`;
}

function hourRange(start: number, end: number): number[] {
  const hours: number[] = [];
  const s = ((start % 24) + 24) % 24;
  const e = ((end % 24) + 24) % 24;
  if (s <= e) {
    for (let h = s; h <= e; h++) hours.push(h);
  } else {
    for (let h = s; h <= 23; h++) hours.push(h);
    for (let h = 0; h <= e; h++) hours.push(h);
  }
  return hours;
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildResults(hourly: HourlyStackResult[], assumptions: DemandStackAssumptions): DemandStackResults {
  const originalPeak = hourly.reduce((best, h) => (h.baselineMw > best.baselineMw ? h : best), hourly[0]);
  const resultingPeak = hourly.reduce((best, h) => (h.resultingLoadMw > best.resultingLoadMw ? h : best), hourly[0]);

  const peakReductionMw = round2(originalPeak.baselineMw - resultingPeak.resultingLoadMw);
  const peakReductionPercent = originalPeak.baselineMw > 0 ? round2((peakReductionMw / originalPeak.baselineMw) * 100) : 0;

  const energyReducedMwh = round2(hourly.reduce((sum, h) => sum + h.efficiencyReductionMw + h.demandResponseReductionMw, 0));
  const energyShiftedMwh = round2(hourly.reduce((sum, h) => sum + Math.max(0, -h.ratesAdjustmentMw), 0));

  const contributions: LayerContribution[] = [
    {
      layer: "efficiency",
      peakReductionMw: round2(hourly[originalPeak.hour].efficiencyReductionMw),
      energyImpactMwh: round2(hourly.reduce((s, h) => s + h.efficiencyReductionMw, 0)),
      valueClass: "calculated",
      assumptionSummary: assumptions.efficiency.enabled
        ? `Assumed persistent reduction of ${clampPercent(assumptions.efficiency.reductionPercent)}% of baseline demand, every hour.`
        : "Not enabled."
    },
    {
      layer: "rates",
      peakReductionMw: round2(Math.max(0, -hourly[originalPeak.hour].ratesAdjustmentMw)),
      energyImpactMwh: energyShiftedMwh,
      valueClass: "calculated",
      assumptionSummary: assumptions.rates.enabled
        ? `Assumed ${clampPercent(assumptions.rates.shiftPercent)}% of demand shifted out of ${describePeakWindow(assumptions.rates)}` +
          (assumptions.rates.conservationEnabled ? `, with ${clampPercent(assumptions.rates.conservationPercent)}% net conservation (not fully redistributed).` : ", fully redistributed to other hours.")
        : "Not enabled."
    },
    {
      layer: "demandResponse",
      peakReductionMw: round2(hourly[originalPeak.hour].demandResponseReductionMw),
      energyImpactMwh: round2(hourly.reduce((s, h) => s + h.demandResponseReductionMw, 0)),
      valueClass: "calculated",
      assumptionSummary: assumptions.demandResponse.enabled
        ? `Assumed ${clampPercent(assumptions.demandResponse.availableCapacityMw >= 0 ? assumptions.demandResponse.participationPercent : 0)}% participation and ${clampPercent(assumptions.demandResponse.performancePercent)}% performance of ${assumptions.demandResponse.availableCapacityMw} MW technical capacity, dispatched for ${assumptions.demandResponse.durationHours}h starting at ${assumptions.demandResponse.eventStartHour}:00 local.`
        : "Not enabled."
    }
  ];

  return {
    hourly,
    originalPeakMw: round2(originalPeak.baselineMw),
    originalPeakHour: originalPeak.hour,
    resultingPeakMw: round2(resultingPeak.resultingLoadMw),
    resultingPeakHour: resultingPeak.hour,
    peakReductionMw,
    peakReductionPercent,
    energyReducedMwh,
    energyShiftedMwh,
    eventDurationHours: assumptions.demandResponse.enabled ? assumptions.demandResponse.durationHours : 0,
    contributions,
    qualityStatus: "calculated_from_baseline_and_assumptions"
  };
}
