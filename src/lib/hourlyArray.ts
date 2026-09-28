import type { HourlyPoint } from "@shared/types/energy";

/**
 * Normalizes a LoadProfile's points (which may have 23, 24, or 25 entries
 * on a DST-transition day) into a fixed 24-length array indexed by local
 * hour, for the Demand Stack engine which always models a 24-hour day.
 * A missing hour (23-hour "spring forward" day) is filled by interpolating
 * its two neighbors; a repeated hour (25-hour "fall back" day) keeps only
 * the first occurrence. This normalization is a modeling simplification and
 * is disclosed in the methodology panel, not hidden.
 */
export function toHourlyArray(points: HourlyPoint[]): number[] {
  const byHour = new Map<number, number>();
  for (const p of points) {
    if (!byHour.has(p.hour)) byHour.set(p.hour, p.value);
  }
  const result: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (byHour.has(h)) {
      result.push(byHour.get(h)!);
    } else {
      const prev = findNearest(byHour, h, -1);
      const next = findNearest(byHour, h, 1);
      result.push(prev !== undefined && next !== undefined ? (prev + next) / 2 : prev ?? next ?? 0);
    }
  }
  return result;
}

function findNearest(byHour: Map<number, number>, from: number, dir: 1 | -1): number | undefined {
  for (let i = 1; i <= 24; i++) {
    const h = ((from + dir * i) % 24 + 24) % 24;
    if (byHour.has(h)) return byHour.get(h);
  }
  return undefined;
}
