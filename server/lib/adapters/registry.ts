import type { EnergyDataAdapter } from "./types.js";
import { EiaDataAdapter } from "./eiaAdapter.js";
import { DemoDataAdapter } from "./demoAdapter.js";
import { ENV, hasEiaKey } from "../../env.js";

export interface AdapterSelection {
  adapter: EnergyDataAdapter;
  /** True when we fell back to demo despite ENERGY_DATA_ADAPTER=eia (e.g. missing key). */
  fellBackToDemo: boolean;
  reason?: string;
}

/**
 * Selects the active adapter from ENERGY_DATA_ADAPTER. The app must keep
 * working with no key configured or when EIA is explicitly disabled --
 * both cases fall back to DemoDataAdapter with a clear reason attached so
 * routes can surface a "demonstration data" status instead of a raw error.
 */
export function selectAdapter(): AdapterSelection {
  if (ENV.ENERGY_DATA_ADAPTER === "demo") {
    return { adapter: new DemoDataAdapter(), fellBackToDemo: false };
  }
  if (!hasEiaKey()) {
    return {
      adapter: new DemoDataAdapter(),
      fellBackToDemo: true,
      reason: "EIA_API_KEY is not configured; serving demonstration data instead."
    };
  }
  return { adapter: new EiaDataAdapter(ENV.EIA_API_KEY), fellBackToDemo: false };
}

export const demoAdapter = new DemoDataAdapter();
