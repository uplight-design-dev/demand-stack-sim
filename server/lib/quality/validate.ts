import type { NormalizedEnergyRecord, QualityInfo, QualityStatus } from "../../../shared/types/energy.js";

export interface QualityCheckResult {
  cleaned: NormalizedEnergyRecord[];
  quality: QualityInfo;
}

const EXTREME_OUTLIER_MW = 250_000; // far beyond any real US BA's demand; catches unit errors

/**
 * Validates a batch of already-normalized hourly records for one region.
 * Flags problems but never silently drops a record for being "wrong" --
 * only true duplicates are collapsed (keeping the first occurrence), because
 * a duplicate timestamp cannot both be shown on a single-valued hourly chart.
 * Everything else is flagged and left in place so downstream code and the UI
 * can decide what to do with it.
 */
export function checkHourlyQuality(records: NormalizedEnergyRecord[]): QualityCheckResult {
  const flags = new Set<string>();
  const seenTimestamps = new Set<string>();
  const cleaned: NormalizedEnergyRecord[] = [];

  for (const record of records) {
    const recordFlags: string[] = [];

    const ts = new Date(record.timestampUtc);
    if (Number.isNaN(ts.getTime())) {
      flags.add("invalid_timestamp");
      continue; // truly unusable, cannot be placed on the timeline
    }

    if (typeof record.value !== "number" || Number.isNaN(record.value)) {
      flags.add("non_numeric_value");
      recordFlags.push("non_numeric_value");
    } else if (record.value < 0) {
      flags.add("negative_demand");
      recordFlags.push("negative_demand");
    } else if (record.value > EXTREME_OUTLIER_MW) {
      flags.add("extreme_outlier");
      recordFlags.push("extreme_outlier");
    }

    if (seenTimestamps.has(record.timestampUtc)) {
      flags.add("duplicate_timestamp");
      continue; // keep first occurrence only
    }
    seenTimestamps.add(record.timestampUtc);

    cleaned.push(recordFlags.length ? { ...record, qualityFlags: [...record.qualityFlags, ...recordFlags] } : record);
  }

  // Frequency/gap check: for hourly data, look for gaps > 1h between consecutive sorted points.
  const sorted = [...cleaned].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc));
  let missingHours = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = new Date(sorted[i].timestampUtc).getTime() - new Date(sorted[i - 1].timestampUtc).getTime();
    const gapHours = Math.round(gapMs / (1000 * 60 * 60));
    if (gapHours > 1) {
      missingHours += gapHours - 1;
    } else if (gapHours < 1 && gapHours !== 0) {
      flags.add("inconsistent_frequency");
    }
  }
  if (missingHours > 0) {
    flags.add("missing_hours");
  }

  const status = deriveStatus(cleaned.length, records.length, flags, missingHours);

  return {
    cleaned,
    quality: { status, flags: Array.from(flags) }
  };
}

function deriveStatus(cleanedCount: number, originalCount: number, flags: Set<string>, missingHours: number): QualityStatus {
  if (cleanedCount === 0) return "unavailable";
  if (flags.has("invalid_timestamp") && cleanedCount < originalCount * 0.5) return "partial";
  // Judge "missing_hours" severity by what share of the expected timeline is
  // actually absent, not by how many raw rows survived -- a two-row dataset
  // with a 5-hour gap between them is far more incomplete than the row
  // count alone would suggest.
  const expectedTotal = cleanedCount + missingHours;
  if (missingHours > 0 && expectedTotal > 0 && missingHours / expectedTotal > 0.1) return "partial";
  if (flags.size === 0) return "complete";
  return "complete_with_warnings";
}

export function isStaleRetrieval(retrievedAt: string, maxAgeMs: number): boolean {
  return Date.now() - new Date(retrievedAt).getTime() > maxAgeMs;
}
