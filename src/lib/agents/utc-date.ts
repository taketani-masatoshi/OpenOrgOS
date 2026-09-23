/**
 * Compact UTC calendar date for IDs (YYYYMMDD).
 * Do not mix with `currentDate()` (tenant/local calendar helpers).
 */

export function utcDateCompact(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
