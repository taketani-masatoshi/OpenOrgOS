const MS_PER_DAY = 86_400_000;

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * MS_PER_DAY);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtcMs(toIso) - toUtcMs(fromIso)) / MS_PER_DAY);
}

/** 民法第143条第2項 — 応当日がない場合はその月の末日 */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  return fromUtcMs(Date.UTC(year, targetMonthIndex, Math.min(day, lastDay)));
}

/** 民法第143条第2項 — 年で定めた期間は起算日に応当する日の前日に満了 · 応当日がなければその月の末日 */
export function periodEndByYears(startIso: string, years: number): string {
  const [year, month, day] = startIso.split("-").map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  if (day > lastDay) return fromUtcMs(Date.UTC(targetYear, month - 1, lastDay));
  return addDays(fromUtcMs(Date.UTC(targetYear, month - 1, day)), -1);
}
