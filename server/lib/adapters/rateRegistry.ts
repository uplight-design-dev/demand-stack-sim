import type { RateDataAdapter } from "./rateAdapterTypes.js";
import { UrdbDataAdapter } from "./urdbAdapter.js";
import { RateDemoAdapter } from "./rateDemoAdapter.js";
import { ENV, hasOpenEiKey } from "../../env.js";

export interface RateAdapterSelection {
  adapter: RateDataAdapter;
  fellBackToDemo: boolean;
  reason?: string;
}

/**
 * Mirrors adapters/registry.ts's selectAdapter(): the app must keep working
 * with no OPENEI_API_KEY configured, falling back to a frozen real-data
 * snapshot (RateDemoAdapter) with a clear reason attached rather than a raw
 * error.
 */
export function selectRateAdapter(): RateAdapterSelection {
  if (!hasOpenEiKey()) {
    return {
      adapter: new RateDemoAdapter(),
      fellBackToDemo: true,
      reason: "OPENEI_API_KEY is not configured; serving a frozen demonstration rate snapshot instead."
    };
  }
  return { adapter: new UrdbDataAdapter(ENV.OPENEI_API_KEY), fellBackToDemo: false };
}

export const rateDemoAdapter = new RateDemoAdapter();
