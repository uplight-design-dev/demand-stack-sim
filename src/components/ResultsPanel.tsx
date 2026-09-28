import React from "react";
import type { DemandStackResults } from "@shared/types/demandStack";
import { formatHourLabel, formatMw, formatMwh } from "../lib/format";
import { SourceBadge } from "./SourceBadge";
import { LoadingIndicator, RefreshingBadge } from "./LoadingIndicator";

const LAYER_LABEL: Record<string, string> = {
  efficiency: "Energy efficiency",
  rates: "Rates & behavior",
  demandResponse: "Demand response"
};
const LAYER_DOT: Record<string, string> = {
  efficiency: "layer-dot-efficiency",
  rates: "layer-dot-rates",
  demandResponse: "layer-dot-demand-response"
};

export function ResultsPanel({ results, loading }: { results: DemandStackResults | null; loading: boolean }) {
  if (!results) {
    if (!loading) return null;
    return (
      <div className="card">
        <LoadingIndicator label="Calculating results…" />
      </div>
    );
  }
  const anyLayerEnabled = results.contributions.some((c) => c.peakReductionMw > 0 || c.energyImpactMwh > 0);

  return (
    <div className="card" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Results</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && <RefreshingBadge />}
          <SourceBadge kind="calculated" />
        </div>
      </div>

      <div className="grid-3" style={{ marginTop: 8 }}>
        <div className="stat">
          <span className="stat-value">{formatMw(results.peakReductionMw)}</span>
          <span className="stat-label">Peak reduction ({results.peakReductionPercent}%)</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatMwh(results.energyReducedMwh)}</span>
          <span className="stat-label">Energy reduced</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatMwh(results.energyShiftedMwh)}</span>
          <span className="stat-label">Energy shifted</span>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="stat">
          <span className="stat-value">{formatMw(results.originalPeakMw)}</span>
          <span className="stat-label">Original peak, at {formatHourLabel(results.originalPeakHour)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatMw(results.resultingPeakMw)}</span>
          <span className="stat-label">Resulting peak, at {formatHourLabel(results.resultingPeakHour)}</span>
        </div>
      </div>

      {anyLayerEnabled && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14 }}>Layer contribution</h3>
          {results.contributions.map((c) => (
            <div key={c.layer} className="toggle-row" style={{ alignItems: "flex-start" }}>
              <div className="toggle-row-header">
                <span className={`layer-dot ${LAYER_DOT[c.layer]}`} aria-hidden />
                <div>
                  <strong>{LAYER_LABEL[c.layer]}</strong>
                  <p className="footnote" style={{ margin: "2px 0 0" }}>{c.assumptionSummary}</p>
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 120 }}>
                <div>{formatMw(c.peakReductionMw)} at peak hour</div>
                <div className="footnote">{formatMwh(c.energyImpactMwh)} over the day</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="footnote" style={{ marginTop: 16 }}>
        Public grid data supplies the baseline; the layer values above are configurable modeled assumptions, and
        peak/energy totals are calculated from the two combined. This experience is educational and not a utility
        forecast.
      </p>
    </div>
  );
}
