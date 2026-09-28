import React from "react";
import type { LoadProfile, StateRegionEntry } from "@shared/types/energy";
import { QualityBadge } from "./SourceBadge";
import { LoadingIndicator, RefreshingBadge } from "./LoadingIndicator";
import { formatLocalDateTime, formatMw, formatMwh } from "../lib/format";

const PROFILE_TYPES: { value: string; label: string }[] = [
  { value: "peak_day", label: "Peak day" },
  { value: "typical_summer_weekday", label: "Typical summer weekday" },
  { value: "typical_winter_weekday", label: "Typical winter weekday" }
];

export function BaselineExplorer({
  entry,
  regionId,
  onRegionChange,
  profileType,
  onProfileTypeChange,
  profile,
  loading
}: {
  entry: StateRegionEntry | null;
  regionId: string;
  onRegionChange: (id: string) => void;
  profileType: string;
  onProfileTypeChange: (v: string) => void;
  profile: LoadProfile | null;
  loading: boolean;
}) {
  if (!entry) return null;

  const noHourly = entry.coverage !== "hourly_and_state";

  return (
    <div className="card">
      <h3>Grid profile</h3>
      <p className="geo-note">{entry.geographicNote}</p>

      {!noHourly && (
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="region-select">Balancing authority / grid profile</label>
            <select id="region-select" value={regionId} onChange={(e) => onRegionChange(e.target.value)}>
              {entry.balancingAuthorities.map((ba) => (
                <option key={ba.id} value={ba.id}>
                  {ba.name} ({ba.id})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="profile-select">Baseline profile</label>
            <select id="profile-select" value={profileType} onChange={(e) => onProfileTypeChange(e.target.value)}>
              {PROFILE_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {noHourly && (
        <p className="footnote">
          No hourly grid profile is available for {entry.state.name} in this app yet -- see the note above.
        </p>
      )}

      {loading && !profile && (
        <div style={{ marginTop: 12 }}>
          <LoadingIndicator label="Loading baseline profile…" />
        </div>
      )}

      {profile && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 12 }}>
            <p style={{ margin: 0, color: "#14213d", fontWeight: 500 }}>{buildInsightSentence(profile)}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {loading && <RefreshingBadge />}
              <QualityBadge status={profile.summary.hoursInDay ? "complete" : "unavailable"} />
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: 16 }}>
            <div className="stat">
              <span className="stat-value">{formatMw(profile.summary.peakMw)}</span>
              <span className="stat-label">Peak demand</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatMw(profile.summary.avgMw)}</span>
              <span className="stat-label">Average demand</span>
            </div>
            <div className="stat">
              <span className="stat-value">{formatMwh(profile.summary.dailyEnergyMwh)}</span>
              <span className="stat-label">Daily energy</span>
            </div>
          </div>
          {profile.summary.isDstTransitionDay && (
            <p className="footnote" style={{ marginTop: 10 }}>
              This local day has {profile.summary.hoursInDay} hours due to a daylight-saving transition.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildInsightSentence(profile: LoadProfile): string {
  if (!profile.points.length) return "No data available for this selection.";
  return `Demand reached ${formatMw(profile.summary.peakMw)} at ${formatLocalDateTime(profile.summary.peakHourLocal)} on this ${profileLabel(
    profile.profileType
  )}. The Demand Stack measures below are modeled against this regional baseline.`;
}

function profileLabel(t: string): string {
  switch (t) {
    case "peak_day":
      return "peak day";
    case "typical_summer_weekday":
      return "typical summer weekday";
    case "typical_winter_weekday":
      return "typical winter weekday";
    default:
      return "selected day";
  }
}
