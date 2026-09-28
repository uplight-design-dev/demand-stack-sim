import type { BalancingAuthorityInfo } from "../../../shared/types/energy.js";
import { STATE_BY_ABBR } from "./states.js";

/**
 * Curated balancing-authority registry.
 *
 * PROVENANCE: every `id` and `name` below was pulled verbatim from the live
 * EIA API v2 "respondent" facet on `electricity/rto/region-data`
 * (https://api.eia.gov/v2/electricity/rto/region-data/facet/respondent) on
 * 2026-09-27, so those two fields are EIA-verified (`verifiedAgainstEia: true`
 * marks entries confirmed this way). That facet does NOT include a state
 * mapping, however -- EIA does not publish "this BA serves these states" as
 * structured data on this route. The `states` array on each entry below is
 * therefore a CURATED mapping built from public knowledge of each BA's/ISO's
 * service territory, not something pulled programmatically from EIA. Treat
 * it as a documented assumption, not source data -- see docs/ARCHITECTURE.md
 * "Adding a state mapping" for how to extend or correct it.
 *
 * The facet also returns several EIA-defined AGGREGATE REGIONS that are not
 * real balancing authorities (US48, CAL, CENT, MIDW, NY, SE, SW, NW, MIDA,
 * FLA, TEX, NE, TEN, CAR, SC) -- those are intentionally excluded here; they
 * roll several BAs together and would misrepresent a single-BA load curve as
 * a whole-region one.
 *
 * Coverage: EIA Form 930 (the source of this route) covers the Lower-48
 * interconnected grid only. Alaska and Hawaii are island/non-interconnected
 * systems and have NO hourly balancing-authority data here -- see
 * geo/regionRegistry.ts, which marks both state_only rather than inventing
 * an hourly profile for them.
 */
export const BALANCING_AUTHORITIES: BalancingAuthorityInfo[] = [
  { id: "PJM", name: "PJM Interconnection, LLC", kind: "iso_rto", states: ["DE", "IL", "IN", "KY", "MD", "MI", "NJ", "NC", "OH", "PA", "TN", "VA", "WV", "DC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "MISO", name: "Midcontinent Independent System Operator, Inc.", kind: "iso_rto", states: ["ND", "SD", "MN", "WI", "IA", "IL", "IN", "MI", "MO", "KY", "AR", "LA", "MS", "TX"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "ERCO", name: "Electric Reliability Council of Texas, Inc.", kind: "iso_rto", states: ["TX"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "CISO", name: "California Independent System Operator", kind: "iso_rto", states: ["CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "ISNE", name: "ISO New England", kind: "iso_rto", states: ["CT", "ME", "MA", "NH", "RI", "VT"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "NYIS", name: "New York Independent System Operator", kind: "iso_rto", states: ["NY"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SWPP", name: "Southwest Power Pool", kind: "iso_rto", states: ["KS", "OK", "NE", "ND", "SD", "NM", "TX", "MT", "WY", "MN", "LA", "AR", "MO", "IA"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "TVA", name: "Tennessee Valley Authority", kind: "utility", states: ["TN", "AL", "MS", "GA", "KY", "NC", "VA"], timezone: "America/Chicago", verifiedAgainstEia: true, notes: "Footprint in AL/MS/GA/KY/NC/VA is partial (border counties only)." },
  { id: "DUK", name: "Duke Energy Carolinas", kind: "utility", states: ["NC", "SC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "CPLE", name: "Duke Energy Progress East", kind: "utility", states: ["NC", "SC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "CPLW", name: "Duke Energy Progress West", kind: "utility", states: ["NC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SCEG", name: "Dominion Energy South Carolina, Inc.", kind: "utility", states: ["SC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SC", name: "South Carolina Public Service Authority", kind: "utility", states: ["SC"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "YAD", name: "Alcoa Power Generating, Inc. - Yadkin Division", kind: "utility", states: ["NC"], timezone: "America/New_York", verifiedAgainstEia: true, notes: "Small single-facility BA." },
  { id: "SOCO", name: "Southern Company Services, Inc. - Trans", kind: "utility", states: ["AL", "GA", "MS"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "AEC", name: "PowerSouth Energy Cooperative", kind: "municipal_or_coop", states: ["AL", "FL"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "FPL", name: "Florida Power & Light Co.", kind: "utility", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "FPC", name: "Duke Energy Florida, Inc.", kind: "utility", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "TEC", name: "Tampa Electric Company", kind: "utility", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "JEA", name: "JEA", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "GVL", name: "Gainesville Regional Utilities", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SEC", name: "Seminole Electric Cooperative", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "FMPP", name: "Florida Municipal Power Pool", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "HST", name: "City of Homestead", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "NSB", name: "Utilities Commission of New Smyrna Beach", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "TAL", name: "City of Tallahassee", kind: "municipal_or_coop", states: ["FL"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SRP", name: "Salt River Project Agricultural Improvement and Power District", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "AZPS", name: "Arizona Public Service Company", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "TEPC", name: "Tucson Electric Power", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "DEAA", name: "Arlington Valley, LLC", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "HGMA", name: "New Harquahala Generating Company, LLC", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "GRIF", name: "Griffith Energy, LLC", kind: "utility", states: ["AZ"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "PSCO", name: "Public Service Company of Colorado", kind: "utility", states: ["CO"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "WACM", name: "Western Area Power Administration - Rocky Mountain Region", kind: "federal_power_marketing", states: ["CO", "NM", "WY", "NE", "SD", "MT"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "NEVP", name: "Nevada Power Company", kind: "utility", states: ["NV"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "LDWP", name: "Los Angeles Department of Water and Power", kind: "municipal_or_coop", states: ["CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "IID", name: "Imperial Irrigation District", kind: "municipal_or_coop", states: ["CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "BANC", name: "Balancing Authority of Northern California", kind: "utility", states: ["CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "TIDC", name: "Turlock Irrigation District", kind: "municipal_or_coop", states: ["CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "PACW", name: "PacifiCorp West", kind: "utility", states: ["OR", "WA", "CA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "PACE", name: "PacifiCorp East", kind: "utility", states: ["UT", "WY", "ID"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "PGE", name: "Portland General Electric Company", kind: "utility", states: ["OR"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "PSEI", name: "Puget Sound Energy, Inc.", kind: "utility", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "TPWR", name: "City of Tacoma, Department of Public Utilities, Light Division", kind: "municipal_or_coop", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "SCL", name: "Seattle City Light", kind: "municipal_or_coop", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "AVA", name: "Avista Corporation", kind: "utility", states: ["WA", "ID"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "GCPD", name: "Public Utility District No. 2 of Grant County, Washington", kind: "municipal_or_coop", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "CHPD", name: "Public Utility District No. 1 of Chelan County", kind: "municipal_or_coop", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "DOPD", name: "PUD No. 1 of Douglas County", kind: "municipal_or_coop", states: ["WA"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "BPAT", name: "Bonneville Power Administration", kind: "federal_power_marketing", states: ["WA", "OR", "ID", "MT"], timezone: "America/Los_Angeles", verifiedAgainstEia: true },
  { id: "IPCO", name: "Idaho Power Company", kind: "utility", states: ["ID", "OR"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "NWMT", name: "NorthWestern Corporation", kind: "utility", states: ["MT"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "WAUW", name: "Western Area Power Administration - Upper Great Plains West", kind: "federal_power_marketing", states: ["MT", "ND"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "EPE", name: "El Paso Electric Company", kind: "utility", states: ["TX", "NM"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "PNM", name: "Public Service Company of New Mexico", kind: "utility", states: ["NM"], timezone: "America/Denver", verifiedAgainstEia: true },
  { id: "WALC", name: "Western Area Power Administration - Desert Southwest Region", kind: "federal_power_marketing", states: ["AZ", "NV", "CA"], timezone: "America/Phoenix", verifiedAgainstEia: true },
  { id: "AECI", name: "Associated Electric Cooperative, Inc.", kind: "municipal_or_coop", states: ["MO"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "LGEE", name: "LG&E and KU Services Company as agent for Louisville Gas and Electric Company and Kentucky Utilities Company", kind: "utility", states: ["KY"], timezone: "America/New_York", verifiedAgainstEia: true },
  { id: "SPA", name: "Southwestern Power Administration", kind: "federal_power_marketing", states: ["AR", "LA", "MO", "OK", "TX"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "SIKE", name: "Sikeston Board of Municipal Utilities", kind: "municipal_or_coop", states: ["MO"], timezone: "America/Chicago", verifiedAgainstEia: true },
  { id: "EEI", name: "Electric Energy, Inc.", kind: "utility", states: ["IL"], timezone: "America/Chicago", verifiedAgainstEia: true }
];

export const BA_BY_ID: Record<string, BalancingAuthorityInfo> = Object.fromEntries(
  BALANCING_AUTHORITIES.map((ba) => [ba.id, ba])
);

export function balancingAuthoritiesForState(stateAbbr: string): BalancingAuthorityInfo[] {
  return BALANCING_AUTHORITIES.filter((ba) => ba.states.includes(stateAbbr));
}

// Sanity check every state referenced actually exists in STATES, so a typo
// here fails loudly at import time instead of silently dropping a mapping.
for (const ba of BALANCING_AUTHORITIES) {
  for (const abbr of ba.states) {
    if (!STATE_BY_ABBR[abbr]) {
      throw new Error(`balancingAuthorities.ts: unknown state abbreviation "${abbr}" on BA "${ba.id}"`);
    }
  }
}
