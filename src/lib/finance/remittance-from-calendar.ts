import type { RemittanceObligation } from "./journal-sources.js";
import {
  buildTaxCalendarPortfolio,
  type TaxCalendarPortfolioRow,
} from "./tax-calendar-portfolio.js";

const CATEGORY_TO_OBLIGATION: Record<string, RemittanceObligation> = {
  withholding: "withholding",
  social_insurance: "social_insurance",
  consumption_tax: "consumption_tax",
};

/** Map tax-calendar cashflow_category to a remittance obligation (or null if unsupported). */
export function remittanceObligationFromCashflowCategory(
  category: string | undefined,
): RemittanceObligation | null {
  if (!category) return null;
  return CATEGORY_TO_OBLIGATION[category] ?? null;
}

export type RemittanceFromCalendar = {
  row: TaxCalendarPortfolioRow;
  obligation: RemittanceObligation;
  /** YYYY-MM derived from deadline (payment month). */
  period: string;
};

/** Resolve a calendar row id into remittance posting inputs. */
export function resolveRemittanceFromCalendarRow(input: {
  rowId: string;
  asOf?: string;
}): RemittanceFromCalendar {
  const portfolio = buildTaxCalendarPortfolio({ today: input.asOf });
  const row = portfolio.rows.find((r) => r.id === input.rowId);
  if (!row) {
    throw new Error(`tax calendar row not found: ${input.rowId}`);
  }
  const obligation = remittanceObligationFromCashflowCategory(row.cashflow_category);
  if (!obligation) {
    throw new Error(
      `calendar row ${input.rowId} cashflow_category=${row.cashflow_category ?? "(none)"} is not a remittance obligation`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline)) {
    throw new Error(`calendar row ${input.rowId} has no usable deadline`);
  }
  return {
    row,
    obligation,
    period: row.deadline.slice(0, 7),
  };
}
