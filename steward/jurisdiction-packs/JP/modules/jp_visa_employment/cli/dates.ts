const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseIsoDate(iso: string): CalendarDate {
  if (!ISO_DATE_PATTERN.test(iso)) throw new Error(`Invalid date (YYYY-MM-DD): ${iso}`);
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function formatIsoDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

function toUtcMs(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Strict YYYY-MM-DD that exists on the calendar (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value) && formatIsoDate(toUtcMs(value)) === value;
}

/** Calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

export function addDays(iso: string, days: number): string {
  return formatIsoDate(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Same day-of-month `months` later (clamped to month end, e.g. 01-31 + 1 → 02-28). */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatIsoDate(Date.UTC(targetYear, targetMonth - 1, targetDay));
}

/** Given day of the month following the month of `iso` (e.g. 翌月10日). */
export function dayOfNextMonth(iso: string, dayOfMonth: number): string {
  const { year, month } = parseIsoDate(iso);
  return formatIsoDate(Date.UTC(year, month, dayOfMonth));
}

/** Last day of the month following the month of `iso` (翌月末日). */
export function lastDayOfNextMonth(iso: string): string {
  const { year, month } = parseIsoDate(iso);
  return formatIsoDate(Date.UTC(year, month + 1, 0));
}
