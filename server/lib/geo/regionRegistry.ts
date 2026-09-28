import type { StateRegionEntry } from "../../../shared/types/energy.js";
import { STATES } from "./states.js";
import { balancingAuthoritiesForState } from "./balancingAuthorities.js";

// EIA Form 930 (electricity/rto/region-data), the source of all hourly grid
// profiles in this app, covers only the Lower-48 interconnected system.
// Alaska and Hawaii's grids are not part of it, so those two states get
// state-level data only -- never a fabricated hourly curve.
const NO_HOURLY_COVERAGE = new Set(["AK", "HI"]);

// Curated default BA per state, used only when it is genuinely unambiguous
// (the state's dominant utility/ISO). Every other state requires the user
// to pick from the list -- see PRODUCT PURPOSE note in docs/ARCHITECTURE.md.
const DEFAULT_BA_BY_STATE: Record<string, string> = {
  VA: "PJM",
  TX: "ERCO",
  CA: "CISO",
  NY: "NYIS",
  NJ: "PJM",
  PA: "PJM",
  MD: "PJM",
  DE: "PJM",
  DC: "PJM",
  OH: "PJM",
  WV: "PJM",
  IL: "MISO",
  WI: "MISO",
  MN: "MISO",
  AZ: "AZPS",
  FL: "FPL",
  WA: "PSEI",
  OR: "PGE",
  NV: "NEVP",
  CO: "PSCO",
  NM: "PNM",
  MT: "NWMT",
  UT: "PACE",
  CT: "ISNE",
  MA: "ISNE",
  ME: "ISNE",
  NH: "ISNE",
  RI: "ISNE",
  VT: "ISNE",
  SC: "SCEG",
  NC: "DUK",
  GA: "SOCO",
  AL: "SOCO",
  MS: "SOCO",
  TN: "TVA",
  KY: "LGEE",
  MO: "AECI",
  OK: "SWPP",
  KS: "SWPP",
  NE: "SWPP",
  ND: "MISO",
  SD: "MISO",
  IA: "MISO",
  IN: "MISO",
  MI: "MISO",
  AR: "MISO",
  LA: "MISO",
  ID: "IPCO",
  WY: "PACE"
};

export function buildRegionRegistry(): StateRegionEntry[] {
  return STATES.map((state) => {
    const bas = balancingAuthoritiesForState(state.abbr);
    const noHourly = NO_HOURLY_COVERAGE.has(state.abbr);

    let coverage: StateRegionEntry["coverage"];
    let geographicNote: string;

    if (noHourly) {
      coverage = "state_only";
      geographicNote =
        `${state.name}'s grid is not part of the Lower-48 interconnected system that EIA's hourly ` +
        `balancing-authority data (Form EIA-930) covers, so no hourly grid profile is available here. ` +
        `State-level annual/monthly figures (sales, price, customers) are still available.`;
    } else if (bas.length === 0) {
      coverage = "not_yet_mapped";
      geographicNote =
        `${state.name} has not yet been curated into this app's balancing-authority mapping. ` +
        `State-level figures are available; hourly grid profiles are not yet enabled for this state.`;
    } else if (bas.length === 1) {
      coverage = "hourly_and_state";
      geographicNote =
        `${state.name} is served by a single mapped balancing authority in this app, ${bas[0].name} (${bas[0].id}). ` +
        `Its footprint may extend slightly beyond ${state.abbr}'s borders or not cover 100% of the state -- ` +
        `this hourly profile represents the balancing authority's territory, not an exact state boundary.`;
    } else {
      coverage = "hourly_and_state";
      geographicNote =
        `${state.name} overlaps ${bas.length} balancing authorities in this app's mapping. Each hourly profile ` +
        `represents that authority's own territory, which may extend into neighboring states or cover only part ` +
        `of ${state.abbr} -- none of them is an exact statewide curve.`;
    }

    return {
      state,
      balancingAuthorities: bas,
      defaultBalancingAuthorityId: DEFAULT_BA_BY_STATE[state.abbr],
      coverage,
      geographicNote
    } satisfies StateRegionEntry;
  });
}

export const REGION_REGISTRY = buildRegionRegistry();

export const REGION_REGISTRY_BY_STATE: Record<string, StateRegionEntry> = Object.fromEntries(
  REGION_REGISTRY.map((entry) => [entry.state.abbr, entry])
);
