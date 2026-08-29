import { parseMonth, currentMonth } from "../utils.js";
import { loadCompany } from "../data.js";

export function lastDayOfMonth(month: string): string {
  const { year, month: m } = parseMonth(month);
  const d = new Date(year, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** FY id (e.g. FY2026) from fiscal year-end month and reference calendar month. */
export function resolveFiscalYear(
  fiscalYearEndMonth: number,
  refMonth = currentMonth(),
): string {
  const { year, month } = parseMonth(refMonth);
  const fyStartMonth = fiscalYearEndMonth === 12 ? 1 : fiscalYearEndMonth + 1;
  const fyYear = month >= fyStartMonth ? year : year - 1;
  return `FY${fyYear}`;
}

/** First calendar month of the fiscal year (YYYY-MM). */
export function fiscalYearStartMonth(
  fiscalYear: string,
  fiscalYearEndMonth: number,
): string {
  const startYear = parseInt(fiscalYear.replace(/^FY/i, ""), 10);
  const startM = fiscalYearEndMonth === 12 ? 1 : fiscalYearEndMonth + 1;
  return `${startYear}-${String(startM).padStart(2, "0")}`;
}

/** First calendar day of the fiscal year (ISO date). */
export function fiscalYearStartDate(
  fiscalYear: string,
  fiscalYearEndMonth: number,
): string {
  return `${fiscalYearStartMonth(fiscalYear, fiscalYearEndMonth)}-01`;
}

/** Last calendar day of the fiscal year (ISO date). */
export function fiscalYearEndDate(fiscalYear: string, fiscalYearEndMonth: number): string {
  const startYear = parseInt(fiscalYear.replace(/^FY/i, ""), 10);
  const endYear = fiscalYearEndMonth === 12 ? startYear : startYear + 1;
  return lastDayOfMonth(`${endYear}-${String(fiscalYearEndMonth).padStart(2, "0")}`);
}

export function resolveCompanyFiscalYearEndMonth(): number {
  const company = loadCompany();
  return company.fiscal_year_end_month ?? 12;
}

/** Default as-of date for GL P/L within a fiscal year. */
export function resolveFiscalYearEndAsOf(fiscalYear: string, fiscalYearEndMonth?: number): string {
  const endMonth = fiscalYearEndMonth ?? resolveCompanyFiscalYearEndMonth();
  return fiscalYearEndDate(fiscalYear, endMonth);
}

/** Resolve active fiscal year id from tenant company settings. */
export function resolveDefaultFiscalYear(fy?: string): string {
  if (fy) return fy.toUpperCase();
  const endMonth = resolveCompanyFiscalYearEndMonth();
  return resolveFiscalYear(endMonth);
}

export function nextFiscalYear(fiscalYear: string): string {
  const year = parseInt(fiscalYear.replace(/^FY/i, ""), 10);
  return `FY${year + 1}`;
}
