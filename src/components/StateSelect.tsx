import React from "react";
import type { StateRegionEntry } from "@shared/types/energy";
import { LoadingIndicator } from "./LoadingIndicator";

/**
 * Only utilities with a live-verified rate mapping (DEFAULT_UTILITY_BY_STATE,
 * see server/lib/geo/utilities.ts) are offered here. This app models one
 * complete utility profile at a time -- load, segments AND rates -- so a
 * state with load data but no verified rate data would only produce a
 * dead end further down the page. Coverage will grow as more utilities are
 * verified; see docs/ARCHITECTURE.md "Rate schedule data source" for the
 * current list and how to add another.
 */
export function StateSelect({
  regions,
  value,
  onChange,
  loading
}: {
  regions: StateRegionEntry[];
  value: string;
  onChange: (abbr: string) => void;
  loading: boolean;
}) {
  const utilities = regions
    .filter((r) => r.hasRateData)
    .sort((a, b) => a.state.name.localeCompare(b.state.name));

  if (loading && utilities.length === 0) {
    return (
      <div className="field">
        <label htmlFor="state-select">Choose a utility to explore</label>
        <LoadingIndicator label="Loading available utilities…" />
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor="state-select">Choose a utility to explore</label>
      <select id="state-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={loading}>
        {utilities.map((r) => (
          <option key={r.state.abbr} value={r.state.abbr}>
            {r.defaultUtilityName ? `${r.defaultUtilityName} (${r.state.name})` : r.state.name}
          </option>
        ))}
      </select>
      <p className="footnote" style={{ marginTop: 4 }}>
        Showing the {utilities.length} utilities with verified live rate data on file. More are added as they're
        confirmed against the source database.
      </p>
    </div>
  );
}
