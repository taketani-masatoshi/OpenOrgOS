import type { PatentHolidaysFile } from "../../../../../../schemas/jp-patent.js";

const MS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;
/** 行政機関の休日に関する法律 1条1項1号（日曜日及び土曜日）— Date#getUTCDay の値 */
const SUNDAY = 0;
const SATURDAY = 6;
/** 行政機関の休日に関する法律 1条1項3号（12月29日から翌年1月3日まで）— MM-DD */
export const YEAR_END_CLOSURE_MONTH_DAYS = ["01-01", "01-02", "01-03", "12-29", "12-30", "12-31"] as const;

export interface HolidayCalendar {
  coveredYears: ReadonlySet<number>;
  closedDates: ReadonlySet<string>;
}

/** 手続期間の末日（特許法3条2項の休日順延後）。`uncovered_year` は祝日データがなく順延を確認できない年。 */
export interface ProcedureDeadline {
  statutory_end: string;
  due: string;
  holiday_extended: boolean;
  uncovered_year?: number;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseIsoDate(iso: string): CalendarDate {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function formatIsoDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUtcMillis(iso: string): number {
  const { year, month, day } = parseIsoDate(iso);
  return Date.UTC(year, month - 1, day);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearOf(iso: string): number {
  return parseIsoDate(iso).year;
}

export function addCalendarDays(iso: string, days: number): string {
  const date = new Date(toUtcMillis(iso) + days * MS_PER_DAY);
  return formatIsoDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMillis(toIso) - toUtcMillis(fromIso)) / MS_PER_DAY);
}

/**
 * 特許法3条1項: 初日不算入（1号）。月・年の期間は暦に従い、最後の月・年の起算日応当日の前日に満了し、
 * 応当日がないときはその月の末日に満了する（2号）。`eventDate` は起点となる日（出願日・公開日等）。
 */
export function statutoryPeriodEnd(eventDate: string, period: { years?: number; months?: number }): string {
  const start = parseIsoDate(addCalendarDays(eventDate, 1));
  const totalMonths = (period.years ?? 0) * MONTHS_PER_YEAR + (period.months ?? 0);
  const monthIndex = start.month - 1 + totalMonths;
  const year = start.year + Math.floor(monthIndex / MONTHS_PER_YEAR);
  const month = (monthIndex % MONTHS_PER_YEAR) + 1;
  const lastDay = daysInMonth(year, month);
  if (start.day > lastDay) return formatIsoDate({ year, month, day: lastDay });
  return addCalendarDays(formatIsoDate({ year, month, day: start.day }), -1);
}

/** 特許法3条1項1号（初日不算入）による日数期間の末日 */
export function statutoryDaysEnd(eventDate: string, days: number): string {
  return addCalendarDays(eventDate, days);
}

export function buildHolidayCalendar(file: PatentHolidaysFile | null): HolidayCalendar {
  if (!file) return { coveredYears: new Set(), closedDates: new Set() };
  return {
    coveredYears: new Set(file.covered_years),
    closedDates: new Set([...file.national_holidays.map((h) => h.date), ...file.year_end_closures]),
  };
}

/** 行政機関の休日（同法1条1項各号）。祝日・年末年始は holidays.yaml の日付で判定する。 */
export function isAdministrativeHoliday(iso: string, calendar: HolidayCalendar): boolean {
  const weekday = new Date(toUtcMillis(iso)).getUTCDay();
  if (weekday === SUNDAY || weekday === SATURDAY) return true;
  return calendar.closedDates.has(iso);
}

/** 特許法3条2項: 手続の期間の末日が行政機関の休日に当たるときは翌日（休日が続けば順延）。 */
export function procedureDeadline(statutoryEnd: string, calendar: HolidayCalendar): ProcedureDeadline {
  let due = statutoryEnd;
  while (isAdministrativeHoliday(due, calendar)) due = addCalendarDays(due, 1);
  const year = yearOf(due);
  const deadline = { statutory_end: statutoryEnd, due, holiday_extended: due !== statutoryEnd };
  return calendar.coveredYears.has(year) ? deadline : { ...deadline, uncovered_year: year };
}

/** 対象年ごとに 1条1項3号の年末年始（1/1–1/3 · 12/29–12/31）が year_end_closures に揃っているか。 */
export function findHolidayCalendarIssues(file: PatentHolidaysFile): string[] {
  const closures = new Set(file.year_end_closures);
  const covered = new Set(file.covered_years);
  const missingClosures = file.covered_years.flatMap((year) =>
    YEAR_END_CLOSURE_MONTH_DAYS.map((monthDay) => `${year}-${monthDay}`).filter((iso) => !closures.has(iso))
  );
  const outOfRange = file.national_holidays.filter((h) => !covered.has(yearOf(h.date)));
  return [
    ...missingClosures.map((iso) => `holidays.yaml: year_end_closures に ${iso} がない（行政機関の休日に関する法律1条1項3号）`),
    ...outOfRange.map((h) => `holidays.yaml: ${h.date} ${h.name} が covered_years の範囲外`),
  ];
}
