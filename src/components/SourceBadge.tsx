import React from "react";

type Kind = "observed" | "assumed" | "calculated" | "demo" | "warning";

const LABELS: Record<Kind, string> = {
  observed: "Observed (EIA)",
  assumed: "Modeled assumption",
  calculated: "Calculated result",
  demo: "Demonstration data",
  warning: "Data warning"
};

export function SourceBadge({ kind, label }: { kind: Kind; label?: string }) {
  return <span className={`badge badge-${kind}`}>{label ?? LABELS[kind]}</span>;
}

export function QualityBadge({ status }: { status: string }) {
  const kind: Kind =
    status === "demonstration"
      ? "demo"
      : status === "complete"
      ? "observed"
      : status === "calculated_from_baseline_and_assumptions" || status === "calculated"
      ? "calculated"
      : "warning";
  const label =
    status === "complete"
      ? "Complete"
      : status === "complete_with_warnings"
      ? "Complete, with warnings"
      : status === "partial"
      ? "Partial data"
      : status === "stale"
      ? "Stale (cached)"
      : status === "unavailable"
      ? "Unavailable"
      : status === "demonstration"
      ? "Demonstration data"
      : status;
  return <SourceBadge kind={kind} label={label} />;
}
