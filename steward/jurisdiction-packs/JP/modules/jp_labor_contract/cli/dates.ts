const MS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;

export interface PeriodLength {
  months: number;
  days: number;
}

function toUtc(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  return fromUtc(new Date(toUtc(iso).getTime() + days * MS_PER_DAY));
}

/** Calendar-month shift; a missing day (e.g. 31st) clamps to the month end. */
export function addMonths(iso: string, months: number): string {
  const base = toUtc(iso);
  const totalMonths = base.getUTCFullYear() * MONTHS_PER_YEAR + base.getUTCMonth() + months;
  const year = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const monthIndex = totalMonths - year * MONTHS_PER_YEAR;
  const day = Math.min(base.getUTCDate(), lastDayOfMonth(year, monthIndex));
  return fromUtc(new Date(Date.UTC(year, monthIndex, day)));
}

export function addYears(iso: string, years: number): string {
  return addMonths(iso, years * MONTHS_PER_YEAR);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso).getTime() - toUtc(fromIso).getTime()) / MS_PER_DAY);
}

function wholeMonthsBetween(startIso: string, endExclusiveIso: string): number {
  const start = toUtc(startIso);
  const end = toUtc(endExclusiveIso);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * MONTHS_PER_YEAR +
    (end.getUTCMonth() - start.getUTCMonth());
  while (months > 0 && addMonths(startIso, months) > endExclusiveIso) months -= 1;
  while (addMonths(startIso, months + 1) <= endExclusiveIso) months += 1;
  return months;
}

/** Length of an inclusive period [start, end] as whole calendar months plus leftover days. */
export function periodLength(startIso: string, endIso: string): PeriodLength {
  const endExclusive = addDays(endIso, 1);
  const months = wholeMonthsBetween(startIso, endExclusive);
  return { months, days: daysBetween(addMonths(startIso, months), endExclusive) };
}

export function formatPeriodLength(length: PeriodLength): string {
  const years = Math.floor(length.months / MONTHS_PER_YEAR);
  const months = length.months % MONTHS_PER_YEAR;
  const daysPart = length.days > 0 ? `${length.days}日` : "";
  return `${years}年${months}か月${daysPart}`;
}

export function laterDate(a: string, b: string): string {
  return a > b ? a : b;
}
