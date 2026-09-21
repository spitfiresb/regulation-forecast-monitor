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
