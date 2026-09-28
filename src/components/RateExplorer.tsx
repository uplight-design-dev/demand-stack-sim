import React, { useEffect, useState } from "react";
import type { RateSchedule, UtilityRateOptions } from "@shared/types/rates";
import { fetchRateSchedules } from "../api/client";
import { onPeakHours } from "../lib/billImpact";
import { SourceBadge } from "./SourceBadge";
import { LoadingIndicator } from "./LoadingIndicator";

export function RateExplorer({
  stateAbbr,
  appliedRateId,
  onApplyRate,
  onClearRate
}: {
  stateAbbr: string;
  appliedRateId: string | null;
  onApplyRate: (schedule: RateSchedule, peakHours: number[]) => void;
  onClearRate: () => void;
}) {
  const [options, setOptions] = useState<UtilityRateOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [demoFlags, setDemoFlags] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchRateSchedules(stateAbbr)
      .then((res) => {
        setOptions(res.data);
        setIsDemo(res.quality.status === "demonstration");
        setDemoFlags(res.quality.flags ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [stateAbbr]);

  // rateSchedules.ts pushes one of two very different flags when it falls
  // back to demo data, and they mean very different things to a user staring
  // at this message: the key genuinely isn't set (reason starts with
  // "OPENEI_API_KEY is not configured"), vs. the key IS configured and valid
  // but the live request to OpenEI failed just now for some other reason
  // (network egress, timeout, upstream error -- flag starts with
  // "urdb_unavailable"). Collapsing both into one "not configured" message
  // (the previous behavior) actively hid the real cause from both the user
  // and whoever is debugging this. Surface the actual flag text instead.
  const liveFailureFlag = demoFlags.find((f) => f.startsWith("urdb_unavailable"));
  const notConfiguredFlag = demoFlags.find((f) => f.startsWith("OPENEI_API_KEY is not configured"));

  if (loading) {
    return (
      <div className="card">
        <h3>Rate Explorer</h3>
        <LoadingIndicator label="Loading rate schedules…" />
      </div>
    );
  }

  const hasAnything = options && (options.defaultSchedule || options.alternativeSchedules.length > 0);
  if (error || !hasAnything) {
    return (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <h3>Rate Explorer</h3>
          {isDemo && <SourceBadge kind="demo" label="Demonstration data (frozen snapshot)" />}
        </div>
        <p className="footnote">
          {error ??
            (isDemo
              ? liveFailureFlag
                ? `OpenEI is configured, but the live request to the Utility Rate Database failed just now, so ` +
                  `you're seeing the offline demonstration snapshot instead (real captured data for Virginia ` +
                  `Electric & Power Co only -- not ${options?.utilityName || "this utility"}). This will resolve ` +
                  `itself once the live request succeeds; reloading the page will retry it.`
                : `The live OpenEI Utility Rate Database isn't configured right now, and the offline demonstration ` +
                  `snapshot only includes real captured data for Virginia Electric & Power Co -- not ` +
                  `${options?.utilityName || "this utility"}. Configure OPENEI_API_KEY and restart the server to ` +
                  `see live rates for every utility.`
              : "No rate schedule is available for this utility yet.")}
        </p>
        {isDemo && liveFailureFlag && (
          <p className="footnote" style={{ marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
            {liveFailureFlag}
          </p>
        )}
        {isDemo && notConfiguredFlag === undefined && liveFailureFlag === undefined && (
          <p className="footnote" style={{ marginTop: 4 }}>
            (No specific reason was reported by the server for this fallback.)
          </p>
        )}
      </div>
    );
  }

  const options_ = options as UtilityRateOptions;
  const touAlternatives = options_.alternativeSchedules.filter((s) => s.hasTimeOfUse);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
        <div>
          <h3>Rate Explorer</h3>
          <p className="footnote" style={{ margin: 0 }}>
            Real tariffs on file for {options_.utilityName || "this utility"}, from the OpenEI Utility Rate Database.
          </p>
        </div>
        {isDemo && <SourceBadge kind="demo" label="Demonstration data (frozen snapshot)" />}
      </div>

      {options_.defaultSchedule && <RateCard schedule={options_.defaultSchedule} label="Standard rate" />}

      {touAlternatives.map((schedule) => {
        const applied = appliedRateId === schedule.id;
        return (
          <div key={schedule.id} className="toggle-row" style={{ alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <RateCard schedule={schedule} label="Opt-in time-of-use rate" />
            </div>
            <button
              type="button"
              className={applied ? "secondary" : "primary"}
              onClick={() => {
                if (applied) {
                  onClearRate();
                } else {
                  const hours = onPeakHours(schedule, new Date().getMonth(), false);
                  onApplyRate(schedule, hours);
                }
              }}
            >
              {applied ? "Applied — remove" : "Apply to Rates layer"}
            </button>
          </div>
        );
      })}

      {options_.qualityFlags.includes("default_inferred_not_source_flagged") && (
        <p className="footnote" style={{ marginTop: 10 }}>
          The source data doesn&apos;t flag a single &quot;default&quot; rate for this utility &mdash; the standard
          schedule shown here was identified by name, not asserted by the source.
        </p>
      )}
    </div>
  );
}

function RateCard({ schedule, label }: { schedule: RateSchedule; label: string }) {
  const onPeak = schedule.periods.find((p) => p.kind === "on_peak");
  const offPeak = schedule.periods.find((p) => p.kind === "off_peak" || p.kind === "flat");
  return (
    <div style={{ marginBottom: 12 }}>
      <p className="footnote" style={{ marginBottom: 2 }}>
        {label}
      </p>
      <strong>{schedule.name}</strong>
      <div className="grid-3" style={{ marginTop: 8 }}>
        {schedule.hasTimeOfUse ? (
          <>
            <div className="stat">
              <span className="stat-value">{offPeak ? `${(offPeak.representativeUsdPerKwh * 100).toFixed(1)}¢` : "—"}</span>
              <span className="stat-label">Off-peak / kWh</span>
            </div>
            <div className="stat">
              <span className="stat-value">{onPeak ? `${(onPeak.representativeUsdPerKwh * 100).toFixed(1)}¢` : "—"}</span>
              <span className="stat-label">On-peak / kWh</span>
            </div>
          </>
        ) : (
          <div className="stat">
            <span className="stat-value">
              {schedule.periods[0] ? `${(schedule.periods[0].representativeUsdPerKwh * 100).toFixed(1)}¢` : "—"}
            </span>
            <span className="stat-label">Per kWh (typical tier)</span>
          </div>
        )}
        <div className="stat">
          <span className="stat-value">{schedule.fixedChargeUsd !== undefined ? `$${schedule.fixedChargeUsd.toFixed(2)}` : "—"}</span>
          <span className="stat-label">Fixed monthly charge</span>
        </div>
      </div>
    </div>
  );
}
