const MS_PER_DAY = 86_400_000;

/** 個情委 通則編GL 3-5-3-4 — 期限の算定は「知った」時点（known_on）を1日目とする */
export const KNOWN_ON_DAY_NUMBER = 1;

/** 行政機関の休日に関する法律1条1項1号 — 日曜日及び土曜日 */
const SUNDAY = 0;
const SATURDAY = 6;

/** 行政機関の休日に関する法律1条1項3号 — 12月29日から翌年1月3日まで */
const YEAR_END_CLOSURE_START = "12-29";
const YEAR_END_CLOSURE_END = "01-03";

function toUtcMs(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return fromUtcMs(toUtcMs(isoDate) + days * MS_PER_DAY);
}

export function daysFromTo(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / MS_PER_DAY);
}

/** known_on を1日目としたときの N 日目の日付 */
export function dayNumberDate(knownOn: string, dayNumber: number): string {
  return addDays(knownOn, dayNumber - KNOWN_ON_DAY_NUMBER);
}

/** asOf が known_on から数えて何日目か（known_on 当日 = 1） */
export function elapsedDayNumber(knownOn: string, asOf: string): number {
  return daysFromTo(knownOn, asOf) + KNOWN_ON_DAY_NUMBER;
}

/** 行政機関の休日に関する法律1条1項 — holidays は同項2号（国民の祝日に関する法律の休日 · holidays.yaml） */
export function isAdministrativeHoliday(isoDate: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(toUtcMs(isoDate)).getUTCDay();
  if (weekday === SUNDAY || weekday === SATURDAY) return true;
  const monthDay = isoDate.slice(5);
  if (monthDay >= YEAR_END_CLOSURE_START || monthDay <= YEAR_END_CLOSURE_END) return true;
  return holidays.has(isoDate);
}

/** 行政機関の休日に関する法律2条 · 通則編GL 3-5-3-4 ※2 — 期限日が休日に当たるときは翌日（休日明け）まで */
export function rollForwardToBusinessDay(isoDate: string, holidays: ReadonlySet<string>): string {
  let candidate = isoDate;
  while (isAdministrativeHoliday(candidate, holidays)) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export function holidayCalendarCoversYear(year: string, holidays: ReadonlySet<string>): boolean {
  return [...holidays].some((holiday) => holiday.startsWith(`${year}-`));
}
