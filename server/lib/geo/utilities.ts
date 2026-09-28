/**
 * Curated default retail utility per state, used by the rate-schedules route
 * to pick which utility's URDB rates to show without asking the user to pick
 * from a list. This mirrors the discipline in geo/regionRegistry.ts's
 * DEFAULT_BA_BY_STATE: only states with a genuinely unambiguous dominant
 * utility get an entry, and every entry's `eiaid` has been confirmed against
 * a live URDB response, not guessed.
 *
 * NOTE: this `eiaid` is a *retail utility* id (URDB's `eiaid` field), a
 * different id space from the *balancing authority* id (e.g. "PJM") used
 * elsewhere in this app for EIA-930 hourly demand -- both are informally
 * called "EIA IDs" but a utility and the balancing authority it sits inside
 * are not the same entity and do not share an id space. Do not conflate the
 * two when adding an entry here.
 *
 * Coverage is intentionally partial. Do not add another state's entry
 * without confirming its eiaid AND its exact `utility` string against a live
 * URDB query first (`eia=<id>&sector=Residential&orderby=startdate&direction=desc`,
 * then check for at least one item with `enddate: null`) -- a wrong eiaid, or
 * a name string that doesn't exactly match URDB's own spelling/punctuation,
 * would either show the wrong utility's rates or silently filter everything
 * out (UrdbDataAdapter matches on `eiaid` AND exact `utility` string, because
 * a single eiaid can be shared by several state-suffixed name variants --
 * see the Arkansas/Texas/Louisiana note below).
 *
 * Two other live-confirmed API quirks worth knowing before extending this
 * list: `is_default=true` and `utility=<name>` are NOT working filter params
 * on api.openei.org/utility_rates (both were tested live on 2026-09-27 and
 * returned unrelated/unfiltered results) -- the only reliable way to find a
 * utility's real eiaid is to query `eia=<candidate id>` directly and check
 * the returned `utility` field, exactly as every entry below was found.
 */
export interface DefaultUtility {
  name: string;
  eiaid: number;
}

export const DEFAULT_UTILITY_BY_STATE: Record<string, DefaultUtility> = {
  // Confirmed live via api.openei.org/utility_rates on 2026-09-27: eiaid
  // 19876 returns Dominion / "Virginia Electric & Power Co" rate schedules,
  // including the default flat/seasonal residential rate ("Residential
  // Schedule 1") and the opt-in TOU rate ("TOU Residential Service Schedule
  // 1P").
  VA: { name: "Virginia Electric & Power Co", eiaid: 19876 },

  // Confirmed live 2026-09-27: eiaid 17609 returns "Southern California
  // Edison Co" rate schedules (multiple currently-active baseline-region
  // variants of the standard Domestic Service rate, plus several active
  // TOU-D options). Note: SCE's standard rate is split into ~9 near-identical
  // "Baseline Region" variants rather than one universal schedule, so the
  // default-inference heuristic in scheduleAnalysis.ts will likely find more
  // than one non-specialty candidate and report `no_default_identified`
  // rather than guess a region -- a real characteristic of SCE's tariff
  // design, not a bug.
  CA: { name: "Southern California Edison Co", eiaid: 17609 },

  // Confirmed live 2026-09-27: eiaid 7140 returns "Georgia Power Co" rate
  // schedules. Currently-active non-specialty default: "SCHEDULE R-30
  // RESIDENTIAL SERVICE"; active TOU alternatives include TOU-RD-11,
  // TOU-OA-14 and TOU-REO-18.
  GA: { name: "Georgia Power Co", eiaid: 7140 },

  // Confirmed live 2026-09-27: eiaid 5109 returns "Detroit Edison Co"
  // (DTE Electric) rate schedules, including an active standard residential
  // rate ("Residential Service Rate (Full Service) D1") and an active TOU
  // rate (D1.2).
  MI: { name: "Detroit Edison Co", eiaid: 5109 },

  // Confirmed live 2026-09-27: eiaid 4110 returns "Commonwealth Edison Co"
  // rate schedules, including active standard residential rates (RDS/BES,
  // single- and multi-family, with and without electric space heat).
  IL: { name: "Commonwealth Edison Co", eiaid: 4110 },

  // Confirmed live 2026-09-27: eiaid 12341 returns "MidAmerican Energy Co"
  // rate schedules, including an active standard residential rate
  // ("RATE RS - RESIDENTIAL SERVICE") and an active TOU rate (RATE RST).
  IA: { name: "MidAmerican Energy Co", eiaid: 12341 },

  // Confirmed live 2026-09-27: eiaid 20847 returns "Wisconsin Electric Power
  // Co" rate schedules, including active standard residential rates
  // ("Residential (Single-Phase) Rg 1" / "(Three-Phase) Rg 1") and several
  // active TOU options (Rg 2, options A-D).
  WI: { name: "Wisconsin Electric Power Co", eiaid: 20847 },

  // Confirmed live 2026-09-27: eiaid 13781 returns "Northern States Power Co
  // - Minnesota" (Xcel Energy) rate schedules, including active standard
  // residential rates (A01/A03, overhead/underground) and active
  // time-of-day options (A02/A04).
  MN: { name: "Northern States Power Co - Minnesota", eiaid: 13781 },

  // Confirmed live 2026-09-27: eiaid 17698 returns rate schedules for THREE
  // state-suffixed name variants sharing one eiaid -- "Southwestern Electric
  // Power Co (Arkansas)", "...(Texas)" and "...(Louisiana)". Only the exact
  // Arkansas-suffixed string has a currently-active Arkansas residential rate
  // ("Residential Service"); using the bare name or another state's suffix
  // would fail the exact-match filter in UrdbDataAdapter or return the wrong
  // state's tariff.
  AR: { name: "Southwestern Electric Power Co (Arkansas)", eiaid: 17698 },

  // Confirmed live 2026-09-27: eiaid 5416 returns rate schedules for both
  // "Progress Energy Carolinas Inc" and "...Inc (South Carolina)" under the
  // same eiaid. The bare (non-suffixed) name is the North Carolina entity and
  // has active standard and TOU residential rates. (Duke Energy Carolinas,
  // the other major NC utility, was not verified against a real eiaid this
  // pass -- do not assume any specific id for it without live-checking.)
  NC: { name: "Progress Energy Carolinas Inc", eiaid: 5416 },

  // Confirmed live 2026-09-27: eiaid 9191 returns "Idaho Power Co" rate
  // schedules, including an active standard residential rate ("Schedule 1 -
  // Residential Service") and an active TOU rate (Schedule 5).
  ID: { name: "Idaho Power Co", eiaid: 9191 },

  // Confirmed live 2026-09-27: eiaid 6452 returns "Florida Power & Light
  // Co." rate schedules (note the trailing period -- part of URDB's exact
  // utility string and required for the exact-match filter to work).
  // Currently-active standard rate: "RS-1 Residential Service"; active TOU
  // rider: "RTR-1 Residential Service TOU".
  FL: { name: "Florida Power & Light Co.", eiaid: 6452 },

  // Confirmed live 2026-09-27: eiaid 803 returns "Arizona Public Service Co"
  // rate schedules, including an active standard residential rate ("Fixed
  // Energy Charge Plan (R-1)", tiered) and active TOU rates (R-TOU-E, R-3,
  // R-EV).
  AZ: { name: "Arizona Public Service Co", eiaid: 803 },

  // Confirmed live 2026-09-27: eiaid 15466 returns "Public Service Co of
  // Colorado" (Xcel Energy) rate schedules, including an active standard
  // residential rate ("Residential Service (Schedule R)") and active TOU/
  // demand options (RE-TOU, RD, RD-TDR).
  CO: { name: "Public Service Co of Colorado", eiaid: 15466 },

  // Confirmed live 2026-09-27: eiaid 14354 returns rate schedules for THREE
  // state-suffixed PacifiCorp name variants sharing one eiaid -- "PacifiCorp
  // (Utah)" (Rocky Mountain Power), "...(Wyoming)" and "...(Oregon)" -- each
  // with currently-active residential rates. Same homonym shape as the
  // Arkansas/Texas/Louisiana SWEPCO entry above: the exact state-suffixed
  // string must be used.
  UT: { name: "PacifiCorp (Utah)", eiaid: 14354 },
  WY: { name: "PacifiCorp (Wyoming)", eiaid: 14354 },
  OR: { name: "PacifiCorp (Oregon)", eiaid: 14354 }

  // States tried and deliberately left unmapped rather than guessed further:
  // NY (a candidate eiaid returned Central Hudson Gas & Elec Corp, not the
  // state's dominant utility Con Edison -- the real Con Edison eiaid was not
  // found this pass), NJ and PA (candidate eiaids returned empty or an
  // unrelated utility), MO (candidate eiaid returned empty), WA (a candidate
  // eiaid returned Southwestern Public Service Co, an Xcel subsidiary
  // serving eastern NM/TX panhandle, not Washington). TX was not attempted:
  // most of the state is served by competitive retail providers under ERCOT
  // rather than one vertically-integrated utility, so a single "default
  // utility" would misrepresent how most Texans are actually billed --
  // picking one requires a product decision, not just a lookup.
};

export function defaultUtilityForState(stateAbbr: string): DefaultUtility | undefined {
  return DEFAULT_UTILITY_BY_STATE[stateAbbr];
}
