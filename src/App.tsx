import React, { useEffect, useMemo, useState } from "react";
import type { LoadProfile, StateOverview, StateRegionEntry } from "@shared/types/energy";
import type { DemandStackAssumptions, DemandStackResults } from "@shared/types/demandStack";
import type { RateSchedule } from "@shared/types/rates";
import { fetchLoadProfile, fetchRegions, fetchSourceStatus, fetchStateOverview, postDemandStack } from "./api/client";
import { TopNav } from "./components/TopNav";
import { StateSelect } from "./components/StateSelect";
import { StateOverviewCard } from "./components/StateOverviewCard";
import { BaselineExplorer } from "./components/BaselineExplorer";
import { BaselineChart } from "./components/BaselineChart";
import { DemandStackBuilder } from "./components/DemandStackBuilder";
import { RateExplorer } from "./components/RateExplorer";
import { ResultsPanel } from "./components/ResultsPanel";
import { MethodologyPanel } from "./components/MethodologyPanel";
import { ExportButtons } from "./components/ExportButtons";
import { SourceBadge } from "./components/SourceBadge";
import { toHourlyArray } from "./lib/hourlyArray";

const DEFAULT_ASSUMPTIONS: DemandStackAssumptions = {
  efficiency: { enabled: false, reductionPercent: 5 },
  rates: {
    enabled: false,
    peakWindowStartHour: 16,
    peakWindowEndHour: 20,
    shiftPercent: 15,
    conservationEnabled: false,
    conservationPercent: 10
  },
  demandResponse: {
    enabled: false,
    eventStartHour: 17,
    durationHours: 3,
    participationPercent: 40,
    performancePercent: 85,
    availableCapacityMw: 1200
  }
};

export default function App() {
  const [regions, setRegions] = useState<StateRegionEntry[]>([]);
  const [stateAbbr, setStateAbbr] = useState("VA");
  const [regionId, setRegionId] = useState("");
  const [profileType, setProfileType] = useState("peak_day");
  const [overview, setOverview] = useState<StateOverview | null>(null);
  const [profile, setProfile] = useState<LoadProfile | null>(null);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [appliedRate, setAppliedRate] = useState<RateSchedule | null>(null);
  const [results, setResults] = useState<DemandStackResults | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingRegions(true);
    fetchRegions()
      .then((res) => setRegions(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingRegions(false));
    fetchSourceStatus()
      .then((res) => setDemoMode(Boolean((res.data as any).fellBackToDemo)))
      .catch(() => {});
  }, []);

  const entry = useMemo(() => regions.find((r) => r.state.abbr === stateAbbr) ?? null, [regions, stateAbbr]);

  useEffect(() => {
    if (!entry) return;
    const defaultId = entry.defaultBalancingAuthorityId ?? entry.balancingAuthorities[0]?.id ?? "";
    setRegionId(defaultId);
    setLoadingOverview(true);
    fetchStateOverview(stateAbbr)
      .then((res) => setOverview(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingOverview(false));
  }, [entry, stateAbbr]);

  useEffect(() => {
    if (!entry || entry.coverage !== "hourly_and_state" || !regionId) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    setError(null);
    fetchLoadProfile({ region: regionId, profileType })
      .then((res) => {
        setProfile(res.data);
        setDemoMode(res.quality.status === "demonstration");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingProfile(false));
  }, [entry, regionId, profileType]);

  useEffect(() => {
    if (!profile || profile.points.length === 0) {
      setResults(null);
      return;
    }
    const baseline = toHourlyArray(profile.points);
    setLoadingResults(true);
    postDemandStack(baseline, assumptions)
      .then((res) => setResults(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingResults(false));
  }, [profile, assumptions]);

  const anyStackLayerOn = assumptions.efficiency.enabled || assumptions.rates.enabled || assumptions.demandResponse.enabled;

  function handleApplyRate(schedule: RateSchedule, peakHours: number[]) {
    setAppliedRate(schedule);
    setAssumptions((prev) => ({
      ...prev,
      rates: { ...prev.rates, enabled: true, peakHours: peakHours.length > 0 ? peakHours : undefined }
    }));
  }

  function handleClearRate() {
    setAppliedRate(null);
    setAssumptions((prev) => ({
      ...prev,
      rates: { ...prev.rates, peakHours: undefined }
    }));
  }

  return (
    <>
      <TopNav />
      <div className="app-shell" id="top">
        <header className="app-header">
          <div className="eyebrow">Uplight &middot; Demand Stack Simulator</div>
          <h1>See what your demand can do.</h1>
          <p className="subtitle">
            In about five minutes, explore how Uplight&apos;s Demand Stack can turn customer demand into a more
            flexible grid resource -- starting from real public grid data.
          </p>
          {demoMode && (
            <div style={{ marginTop: 10 }}>
              <SourceBadge kind="demo" label="Showing demonstration data (EIA not configured or unavailable)" />
            </div>
          )}
          {error && (
            <p className="footnote" style={{ color: "#8a5a00", marginTop: 10 }}>
              {error}
            </p>
          )}
        </header>

        <section className="section anchor-target" id="overview">
          <StateSelect regions={regions} value={stateAbbr} onChange={setStateAbbr} loading={loadingRegions} />
          <StateOverviewCard overview={overview} loading={loadingOverview} />
        </section>

        <section className="section anchor-target" id="segments">
          <BaselineExplorer
            entry={entry}
            regionId={regionId}
            onRegionChange={setRegionId}
            profileType={profileType}
            onProfileTypeChange={setProfileType}
            profile={profile}
            loading={loadingProfile}
          />
        </section>

        {profile && profile.points.length > 0 && (
          <>
            <section className="section card">
              <h2>Baseline load curve</h2>
              <BaselineChart hourly={results?.hourly ?? toHourlyArray(profile.points).map((v, hour) => ({
                hour, baselineMw: v, efficiencyReductionMw: 0, ratesAdjustmentMw: 0, demandResponseReductionMw: 0, resultingLoadMw: v
              }))} showResulting={anyStackLayerOn} />
            </section>

            <section className="section anchor-target" id="demand-stack-builder">
              <DemandStackBuilder assumptions={assumptions} onChange={setAssumptions} appliedRateName={appliedRate?.name ?? null} />
            </section>

            <section className="section">
              <RateExplorer
                stateAbbr={stateAbbr}
                appliedRateId={appliedRate?.id ?? null}
                onApplyRate={handleApplyRate}
                onClearRate={handleClearRate}
              />
            </section>

            <section className="section anchor-target" id="results">
              <ResultsPanel results={results} loading={loadingResults} />
            </section>

            <section className="section">
              <MethodologyPanel profile={profile} provenanceSourceUrl="https://www.eia.gov/opendata/browser/electricity/rto/region-data" />
            </section>

            <section className="section card">
              <h3>Download or share this scenario</h3>
              <ExportButtons profile={profile} results={results} regionLabel={profile.regionName} stateAbbr={stateAbbr} />
            </section>
          </>
        )}

        <section className="cta">
          <h3>Explore what a tailored Demand Stack could look like for your territory.</h3>
          <p>Uplight partners with utilities to turn scenarios like this into real programs.</p>
          <a href="https://www.uplight.com/contact" target="_blank" rel="noreferrer">
            <button className="primary" style={{ marginTop: 8 }}>Talk to Uplight</button>
          </a>
        </section>
      </div>
    </>
  );
}
