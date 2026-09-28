import React from "react";
import type { StateOverview } from "@shared/types/energy";
import { QualityBadge } from "./SourceBadge";
import { LoadingIndicator, RefreshingBadge } from "./LoadingIndicator";

export function StateOverviewCard({ overview, loading }: { overview: StateOverview | null; loading: boolean }) {
  if (!overview) {
    if (!loading) return null;
    return (
      <div className="card">
        <LoadingIndicator label="Loading utility overview…" />
      </div>
    );
  }

  const price = overview.metrics.find((m) => m.metric === "retail_price" && m.sector === "RES");
  const sales = overview.metrics.find((m) => m.metric === "sales" && m.sector === "ALL");
  const customers = overview.metrics.find((m) => m.metric === "customers" && m.sector === "ALL");

  return (
    <div className="card" style={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3>{overview.stateName} electricity overview</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && <RefreshingBadge />}
          <QualityBadge status={overview.quality.status} />
        </div>
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        {price && (
          <div className="stat">
            <span className="stat-value">{price.value.toFixed(1)}&cent;</span>
            <span className="stat-label">Residential price per kWh ({price.period})</span>
          </div>
        )}
        {sales && (
          <div className="stat">
            <span className="stat-value">{Math.round(sales.value).toLocaleString("en-US")}</span>
            <span className="stat-label">Thousand MWh sold ({sales.period})</span>
          </div>
        )}
        {customers && (
          <div className="stat">
            <span className="stat-value">{Math.round(customers.value).toLocaleString("en-US")}</span>
            <span className="stat-label">Ultimate customers ({customers.period})</span>
          </div>
        )}
      </div>
      <p className="footnote" style={{ marginTop: 14 }}>
        Source: {overview.provenance.source} &middot; {overview.provenance.dataset}
      </p>
      {overview.quality.status === "demonstration" && <DemoReason flags={overview.quality.flags} />}
    </div>
  );
}

// Mirrors RateExplorer's distinction: stateOverview.ts's registry.ts pushes
// one of two very different flags when it falls back to demo -- the key
// genuinely isn't set ("EIA_API_KEY is not configured...") vs. it IS set but
// the live EIA request just failed ("eia_unavailable: <real reason>").
// Showing only the badge (the previous behavior) collapsed both into
// "Demonstration data" with no way to tell which one you're looking at.
function DemoReason({ flags }: { flags: string[] }) {
  const liveFailure = flags.find((f) => f.startsWith("eia_unavailable"));
  const notConfigured = flags.find((f) => f.startsWith("EIA_API_KEY is not configured"));
  if (!liveFailure && !notConfigured) return null;
  return (
    <p className="footnote" style={{ marginTop: 2, color: "var(--color-warning-text)" }}>
      {liveFailure
        ? "EIA is configured, but the live request just failed -- this will resolve itself once it succeeds; reloading the page will retry it."
        : "EIA_API_KEY isn't configured for this deployment."}
      {liveFailure && (
        <span style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: 11, marginTop: 2 }}>
          {liveFailure}
        </span>
      )}
    </p>
  );
}
