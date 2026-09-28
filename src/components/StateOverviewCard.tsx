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
    </div>
  );
}
