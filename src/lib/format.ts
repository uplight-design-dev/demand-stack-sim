export function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} MW`;
}

export function formatMwh(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} MWh`;
}

export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "a.m." : "p.m.";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

export function formatLocalDateTime(iso: string): string {
  if (!iso) return "";
  const [datePart, timePart] = iso.split("T");
  if (!timePart) return datePart;
  const hour = Number(timePart.slice(0, 2));
  return `${datePart} at ${formatHourLabel(hour)}`;
}
