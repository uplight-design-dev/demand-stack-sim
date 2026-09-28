import { Router } from "express";
import type { ApiEnvelope } from "../../shared/types/energy.js";
import { REGION_REGISTRY } from "../lib/geo/regionRegistry.js";
import { selectAdapter } from "../lib/adapters/registry.js";
import { defaultUtilityForState } from "../lib/geo/utilities.js";

export const regionsRouter = Router();

regionsRouter.get("/regions", (_req, res) => {
  const { adapter, fellBackToDemo, reason } = selectAdapter();
  const isDemoActive = adapter.sourceName === "DEMO";

  const data = REGION_REGISTRY.map((entry) => {
    const utility = defaultUtilityForState(entry.state.abbr);
    return {
      state: entry.state,
      coverage: entry.coverage,
      geographicNote: entry.geographicNote,
      defaultBalancingAuthorityId: entry.defaultBalancingAuthorityId,
      balancingAuthorities: entry.balancingAuthorities.map((ba) => ({
        id: ba.id,
        name: ba.name,
        kind: ba.kind,
        timezone: ba.timezone,
        notes: ba.notes
      })),
      hasRateData: Boolean(utility),
      defaultUtilityName: utility?.name
    };
  });

  const envelope: ApiEnvelope<typeof data> = {
    data,
    summary: {
      stateCount: data.length,
      statesWithHourlyCoverage: data.filter((d) => d.coverage === "hourly_and_state").length,
      statesWithRateData: data.filter((d) => d.hasRateData).length
    },
    provenance: {
      source: isDemoActive ? "Demonstration data" : "Curated registry + U.S. Energy Information Administration (EIA)",
      dataset: "State-to-balancing-authority geographic registry",
      sourceUrl: "https://www.eia.gov/opendata/browser/electricity/rto/region-data",
      retrievedAt: new Date().toISOString()
    },
    quality: {
      status: isDemoActive ? "demonstration" : "complete",
      flags: fellBackToDemo && reason ? [reason] : []
    },
    cache: { status: "fresh" }
  };

  res.json(envelope);
});
