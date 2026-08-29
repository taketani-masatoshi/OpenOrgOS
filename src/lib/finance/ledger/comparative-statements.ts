import { buildBalanceSheet, type BalanceSheetReport } from "./balance-sheet.js";
import { buildGlProfitLossSummary, type GlPlSummary } from "../gl-report-basis.js";
import { loadOpeningBalances } from "./opening-balance.js";
import {
  fiscalYearEndDate,
  fiscalYearStartDate,
  resolveCompanyFiscalYearEndMonth,
  resolveFiscalYear,
} from "../fiscal-year.js";

export type ComparativeBalanceSheet = {
  as_of: string;
  prior_as_of: string;
  current: BalanceSheetReport;
  prior: BalanceSheetReport;
  total_assets_yen: { current: number; prior: number; delta: number };
  total_liabilities_yen: { current: number; prior: number; delta: number };
  total_equity_yen: { current: number; prior: number; delta: number };
  net_income_yen: { current: number; prior: number; delta: number };
};

export type ComparativeProfitLoss = {
  as_of: string;
  prior_as_of: string;
  fiscal_year: string;
  current: GlPlSummary;
  prior: GlPlSummary;
  revenue_total: { current: number; prior: number; delta: number };
  net_profit: { current: number; prior: number; delta: number };
};

function pair(current: number, prior: number) {
  return { current, prior, delta: current - prior };
}

/**
 * Prior period as-of for comparative statements.
 * Prefer day before current FY start; if opening cutover is later, use opening.as_of.
 */
export function resolvePriorAsOf(input: {
  fiscalYear: string;
  asOf?: string;
}): string {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fyStart = fiscalYearStartDate(input.fiscalYear, endMonth);
  const dayBeforeStart = (() => {
    const d = new Date(`${fyStart}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const opening = loadOpeningBalances();
  if (opening?.as_of && opening.as_of >= dayBeforeStart) {
    return opening.as_of;
  }
  return dayBeforeStart;
}

export function buildComparativeBalanceSheet(input: {
  asOf: string;
  priorAsOf?: string;
  fiscalYear?: string;
}): ComparativeBalanceSheet {
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const fiscalYear =
    input.fiscalYear ?? resolveFiscalYear(endMonth, input.asOf.slice(0, 7));
  const priorAsOf =
    input.priorAsOf ?? resolvePriorAsOf({ fiscalYear, asOf: input.asOf });
  const current = buildBalanceSheet({ asOf: input.asOf, fiscalYear });
  const priorFy = resolveFiscalYear(endMonth, priorAsOf.slice(0, 7));
  const prior = buildBalanceSheet({ asOf: priorAsOf, fiscalYear: priorFy });
  return {
    as_of: input.asOf,
    prior_as_of: priorAsOf,
    current,
    prior,
    total_assets_yen: pair(current.total_assets_yen, prior.total_assets_yen),
    total_liabilities_yen: pair(
      current.total_liabilities_yen,
      prior.total_liabilities_yen,
    ),
    total_equity_yen: pair(current.total_equity_yen, prior.total_equity_yen),
    net_income_yen: pair(current.net_income_yen, prior.net_income_yen),
  };
}

export function buildComparativeProfitLoss(input: {
  fiscalYear: string;
  asOf?: string;
  priorAsOf?: string;
}): ComparativeProfitLoss {
  const asOf = input.asOf ?? fiscalYearEndDate(
    input.fiscalYear,
    resolveCompanyFiscalYearEndMonth(),
  );
  const priorAsOf =
    input.priorAsOf ?? resolvePriorAsOf({ fiscalYear: input.fiscalYear, asOf });
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const priorFy = resolveFiscalYear(endMonth, priorAsOf.slice(0, 7));
  const current = buildGlProfitLossSummary({
    fiscalYear: input.fiscalYear,
    asOf,
  });
  const prior = buildGlProfitLossSummary({
    fiscalYear: priorFy,
    asOf: priorAsOf,
  });
  return {
    as_of: asOf,
    prior_as_of: priorAsOf,
    fiscal_year: input.fiscalYear,
    current,
    prior,
    revenue_total: pair(current.revenue_total, prior.revenue_total),
    net_profit: pair(current.net_profit, prior.net_profit),
  };
}
