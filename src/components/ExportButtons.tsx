import React from "react";
import type { LoadProfile } from "@shared/types/energy";
import type { DemandStackResults } from "@shared/types/demandStack";
import { toHourlyArray } from "../lib/hourlyArray";

export function ExportButtons({
  profile,
  results,
  regionLabel,
  stateAbbr
}: {
  profile: LoadProfile | null;
  results: DemandStackResults | null;
  regionLabel: string;
  stateAbbr: string;
}) {
  if (!profile) return null;

  function downloadCsv() {
    const baseline = toHourlyArray(profile!.points);
    const header = [
      "state",
      "region",
      "region_type",
      "hour_local",
      "baseline_mw",
      "efficiency_reduction_mw",
      "rates_adjustment_mw",
      "demand_response_reduction_mw",
      "resulting_load_mw",
      "classification",
      "source",
      "dataset",
      "quality_flags"
    ];
    const rows = baseline.map((mw, hour) => {
      const hourResult = results?.hourly[hour];
      return [
        stateAbbr,
        profile!.regionId,
        profile!.regionType,
        String(hour).padStart(2, "0") + ":00",
        mw.toFixed(2),
        (hourResult?.efficiencyReductionMw ?? 0).toFixed(2),
        (hourResult?.ratesAdjustmentMw ?? 0).toFixed(2),
        (hourResult?.demandResponseReductionMw ?? 0).toFixed(2),
        (hourResult?.resultingLoadMw ?? mw).toFixed(2),
        "baseline=observed/demo, reductions=assumed, resulting=calculated",
        profile!.regionType === "demo" ? "DEMO" : "EIA",
        "electricity/rto/region-data",
        (profile!.summary.isDstTransitionDay ? "dst_transition_day" : "")
      ];
    });
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    triggerDownload(csv, "text/csv", `demand-stack-${stateAbbr}-${profile!.regionId}.csv`);
  }

  function downloadJson() {
    const payload = {
      exportTimestamp: new Date().toISOString(),
      state: stateAbbr,
      region: { id: profile!.regionId, name: regionLabel, type: profile!.regionType },
      dateRange: profile!.summary.profileDate,
      profileType: profile!.profileType,
      methodologyVersion: "v1",
      baseline: profile,
      assumptionsAndResults: results,
      disclaimer:
        "Educational scenario based on public grid data and configurable assumptions. Not a utility forecast."
    };
    triggerDownload(JSON.stringify(payload, null, 2), "application/json", `demand-stack-${stateAbbr}-${profile!.regionId}.json`);
  }

  return (
    <div className="export-row">
      <button className="secondary" onClick={downloadCsv}>
        Download CSV
      </button>
      <button className="secondary" onClick={downloadJson}>
        Download JSON scenario
      </button>
    </div>
  );
}

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
