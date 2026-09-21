export function parseAgendaDate(raw: string): {
  date: string | null;
  precision: "day" | "month" | "unknown";
} {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return { date: null, precision: "unknown" };
  const [, month, day, year] = match;
  if (+month < 1 || +month > 12) return { date: null, precision: "unknown" };
  if (day === "00") return { date: `${year}-${month}`, precision: "month" };
  const date = `${year}-${month}-${day}`;
  if (!isIsoDay(date)) return { date: null, precision: "unknown" };
  return { date, precision: "day" };
}
export function isIsoDay(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function formatDate(value: string | null, withTime = false): string {
  if (!value) return "Unknown";
  const monthOnly = /^\d{4}-\d{2}$/.test(value);
  const date = new Date(
    monthOnly
      ? `${value}-01T12:00:00Z`
      : value.length === 10
        ? `${value}T12:00:00Z`
        : value,
  );
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    ...(!monthOnly ? { day: "numeric" as const } : {}),
    year: "numeric",
    timeZone: "UTC",
    ...(withTime
      ? {
          hour: "numeric" as const,
          minute: "2-digit" as const,
          timeZoneName: "short" as const,
        }
      : {}),
  }).format(date);
}
export function targetElapsed(date: string | null, now = new Date()): boolean {
  if (!date) return false;
  if (date.length === 7) return date < now.toISOString().slice(0, 7);
  return date.slice(0, 10) < now.toISOString().slice(0, 10);
}
