/** Whole days from today (local time, date-only) until a "YYYY-MM-DD" date. Negative if past. */
export function daysUntil(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Whole days from an ISO8601 datetime string until now. */
export function daysSince(isoDateTime: string): number {
  const then = new Date(isoDateTime);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

export function formatDaysLeft(days: number): string {
  if (days < 0) return `expired ${Math.abs(days)}d ago`;
  if (days === 0) return "expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}
