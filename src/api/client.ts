import type { ApiEnvelope, LoadProfile, StateOverview, StateRegionEntry } from "@shared/types/energy";
import type { DemandStackAssumptions, DemandStackResults } from "@shared/types/demandStack";
import type { UtilityRateOptions } from "@shared/types/rates";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? `${body.error}` : `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchRegions(): Promise<ApiEnvelope<StateRegionEntry[]>> {
  return getJson("/api/energy/regions");
}

export function fetchStateOverview(state: string, year?: string): Promise<ApiEnvelope<StateOverview>> {
  const qs = new URLSearchParams({ state, ...(year ? { year } : {}) });
  return getJson(`/api/energy/state-overview?${qs.toString()}`);
}

export interface LoadProfileParams {
  region: string;
  profileType: string;
  metric?: string;
  year?: string;
  date?: string;
  start?: string;
  end?: string;
}

export function fetchLoadProfile(params: LoadProfileParams): Promise<ApiEnvelope<LoadProfile>> {
  const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
  const qs = new URLSearchParams(entries);
  return getJson(`/api/energy/load-profile?${qs.toString()}`);
}

export function fetchSourceStatus(region?: string): Promise<ApiEnvelope<Record<string, unknown>>> {
  const qs = new URLSearchParams(region ? { region } : {});
  return getJson(`/api/energy/source-status?${qs.toString()}`);
}

export function fetchRateSchedules(state: string, sector: string = "Residential"): Promise<ApiEnvelope<UtilityRateOptions>> {
  const qs = new URLSearchParams({ state, sector });
  return getJson(`/api/energy/rate-schedules?${qs.toString()}`);
}

export async function postDemandStack(
  baselineMw: number[],
  assumptions: DemandStackAssumptions
): Promise<{ data: DemandStackResults }> {
  const res = await fetch("/api/energy/demand-stack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baselineMw, assumptions })
  });
  if (!res.ok) throw new Error(`demand-stack request failed: ${res.status}`);
  return res.json();
}
