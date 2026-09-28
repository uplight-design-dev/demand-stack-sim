import React, { useState } from "react";
import type { LoadProfile } from "@shared/types/energy";

export function MethodologyPanel({ profile, provenanceSourceUrl }: { profile: LoadProfile | null; provenanceSourceUrl: string }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;

  return (
    <div className="card">
      <button className="link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide" : "About this data"} &nbsp;{open ? "−" : "+"}
      </button>
      {open && (
        <div className="methodology-panel">
          <dl>
            <dt>Source organization</dt>
            <dd>U.S. Energy Information Administration (EIA)</dd>
            <dt>Dataset</dt>
            <dd>Hourly Electric Grid Monitor, Form EIA-930 (electricity/rto/region-data)</dd>
            <dt>Region represented</dt>
            <dd>
              {profile.regionName} ({profile.regionId}), a {profile.regionType.replace("_", " ")}
            </dd>
            <dt>Frequency</dt>
            <dd>Hourly, converted from UTC to {profile.timezone}</dd>
            <dt>Units</dt>
            <dd>Megawatts (MW)</dd>
            <dt>Profile selection method</dt>
            <dd>{profileMethod(profile.profileType)}</dd>
            <dt>Source days used</dt>
            <dd>{profile.summary.sourceDaysUsed}</dd>
            <dt>Missing hours detected</dt>
            <dd>{profile.summary.missingHourCount}</dd>
            <dt>Daylight-saving transition</dt>
            <dd>{profile.summary.isDstTransitionDay ? `Yes -- this local day has ${profile.summary.hoursInDay} hours` : "No"}</dd>
            <dt>Observed vs. modeled</dt>
            <dd>Baseline values are observed EIA data (or clearly labeled demonstration data); Demand Stack layer values are modeled assumptions; peak/energy totals are calculated.</dd>
            <dt>Source link</dt>
            <dd>
              <a href={provenanceSourceUrl} target="_blank" rel="noreferrer">
                {provenanceSourceUrl}
              </a>
            </dd>
          </dl>
          <p className="footnote" style={{ marginTop: 12 }}>
            Geographic note: an hourly profile represents its balancing authority's own territory, which may not
            match state boundaries exactly. This experience is educational, not a utility forecast, and is not
            suitable for regulatory filings.
          </p>
        </div>
      )}
    </div>
  );
}

function profileMethod(profileType: string): string {
  switch (profileType) {
    case "peak_day":
      return "The single local calendar day containing the highest observed hourly value in the selected year.";
    case "typical_summer_weekday":
      return "Average of each local hour across all complete (24-hour) non-weekend days in June-August.";
    case "typical_winter_weekday":
      return "Average of each local hour across all complete (24-hour) non-weekend days in December-February.";
    case "date_range_average":
      return "Average of each local hour across all complete days in the selected date range.";
    default:
      return "A specific local calendar date selected directly.";
  }
}
