import React from "react";
import type { DemandStackAssumptions } from "@shared/types/demandStack";

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

export function DemandStackBuilder({
  assumptions,
  onChange,
  appliedRateName
}: {
  assumptions: DemandStackAssumptions;
  onChange: (next: DemandStackAssumptions) => void;
  appliedRateName?: string | null;
}) {
  return (
    <div className="card">
      <h3>Build your Demand Stack</h3>
      <p className="footnote" style={{ marginBottom: 4 }}>
        Layer order is fixed: Energy Efficiency, then Rates &amp; Behavior, then Demand Response.
      </p>

      <div className="toggle-row">
        <div className="toggle-row-header">
          <span className="layer-dot layer-dot-efficiency" aria-hidden />
          <div>
            <strong>Energy efficiency</strong>
            <p className="footnote" style={{ margin: 0 }}>
              A persistent, always-on reduction applied to every hour.
            </p>
          </div>
        </div>
        <Switch
          checked={assumptions.efficiency.enabled}
          label="Toggle energy efficiency"
          onChange={(v) => onChange({ ...assumptions, efficiency: { ...assumptions.efficiency, enabled: v } })}
        />
      </div>
      {assumptions.efficiency.enabled && (
        <div className="assumption-controls">
          <div className="field">
            <label>Reduction (% of baseline)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={assumptions.efficiency.reductionPercent}
              onChange={(e) =>
                onChange({
                  ...assumptions,
                  efficiency: { ...assumptions.efficiency, reductionPercent: Number(e.target.value) }
                })
              }
            />
          </div>
        </div>
      )}

      <div className="toggle-row">
        <div className="toggle-row-header">
          <span className="layer-dot layer-dot-rates" aria-hidden />
          <div>
            <strong>Rates &amp; behavior</strong>
            <p className="footnote" style={{ margin: 0 }}>
              Shifts a share of demand away from a configured peak window.
            </p>
          </div>
        </div>
        <Switch
          checked={assumptions.rates.enabled}
          label="Toggle rates and behavior"
          onChange={(v) => onChange({ ...assumptions, rates: { ...assumptions.rates, enabled: v } })}
        />
      </div>
      {assumptions.rates.enabled && (() => {
        const usingRealRate = Boolean(assumptions.rates.peakHours && assumptions.rates.peakHours.length > 0);
        return (
          <div className="assumption-controls">
            {usingRealRate ? (
              <p className="footnote" style={{ width: "100%", margin: "0 0 4px" }}>
                Using real on-peak hours from {appliedRateName ?? "an applied rate"} (see Rate Explorer below), not
                the manual window.
              </p>
            ) : (
              <>
                <div className="field">
                  <label>Peak window start (hour)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={assumptions.rates.peakWindowStartHour}
                    onChange={(e) => onChange({ ...assumptions, rates: { ...assumptions.rates, peakWindowStartHour: Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Peak window end (hour)</label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={assumptions.rates.peakWindowEndHour}
                    onChange={(e) => onChange({ ...assumptions, rates: { ...assumptions.rates, peakWindowEndHour: Number(e.target.value) } })}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label>Shift (% of window demand)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={assumptions.rates.shiftPercent}
                onChange={(e) => onChange({ ...assumptions, rates: { ...assumptions.rates, shiftPercent: Number(e.target.value) } })}
              />
            </div>
          </div>
        );
      })()}

      <div className="toggle-row">
        <div className="toggle-row-header">
          <span className="layer-dot layer-dot-demand-response" aria-hidden />
          <div>
            <strong>Demand response</strong>
            <p className="footnote" style={{ margin: 0 }}>
              A temporary reduction dispatched during a configured event window.
            </p>
          </div>
        </div>
        <Switch
          checked={assumptions.demandResponse.enabled}
          label="Toggle demand response"
          onChange={(v) => onChange({ ...assumptions, demandResponse: { ...assumptions.demandResponse, enabled: v } })}
        />
      </div>
      {assumptions.demandResponse.enabled && (
        <div className="assumption-controls">
          <div className="field">
            <label>Event start (hour)</label>
            <input
              type="number"
              min={0}
              max={23}
              value={assumptions.demandResponse.eventStartHour}
              onChange={(e) =>
                onChange({ ...assumptions, demandResponse: { ...assumptions.demandResponse, eventStartHour: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>Duration (hours)</label>
            <input
              type="number"
              min={1}
              max={8}
              value={assumptions.demandResponse.durationHours}
              onChange={(e) =>
                onChange({ ...assumptions, demandResponse: { ...assumptions.demandResponse, durationHours: Number(e.target.value) } })
              }
            />
          </div>
          <div className="field">
            <label>Participation (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={assumptions.demandResponse.participationPercent}
              onChange={(e) =>
                onChange({
                  ...assumptions,
                  demandResponse: { ...assumptions.demandResponse, participationPercent: Number(e.target.value) }
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
