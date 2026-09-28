import React from "react";

/**
 * A small, consistent "this is actively working, not broken" signal used
 * everywhere the app is waiting on a network request -- the initial utility
 * list, a state's overview, its load profile, its rate schedules, or a
 * demand-stack recompute. Deliberately minimal (a spinning ring + one line
 * of text, no skeleton screens or progress bars) per the product's
 * "restrained, never gimmicky" design bar, and respects
 * prefers-reduced-motion (the ring stops spinning but the label still reads
 * as "in progress").
 */
export function LoadingIndicator({ label }: { label: string }) {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span className="footnote" style={{ margin: 0 }}>
        {label}
      </span>
    </div>
  );
}

/** A compact variant for layering onto a card that's showing stale/previous data while it refreshes. */
export function RefreshingBadge({ label = "Updating…" }: { label?: string }) {
  return (
    <span className="loading-row loading-row-inline" role="status" aria-live="polite">
      <span className="spinner spinner-sm" aria-hidden />
      <span className="footnote" style={{ margin: 0 }}>
        {label}
      </span>
    </span>
  );
}
