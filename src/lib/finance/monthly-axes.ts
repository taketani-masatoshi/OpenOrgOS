/**
 * Monthly finance axis split (P/L vs investing cash).
 *
 * Accounting basis (GAAP / JP GAAP aligned):
 * - CAPEX is capitalized on the balance sheet; it is NOT a period P/L expense.
 *   P/L recognizes depreciation over the asset's useful life instead.
 * - OPEX is expensed in the period incurred and reduces operating profit.
 * - Depreciation is a non-cash P/L expense (exclude from cash outflow).
 *
 * Aligns with ADR 0029 outlook axes.
 */

export type MonthlyAxisTotals = {
  revenue_yen: number;
  /** Period operating expenses (excludes CAPEX and depreciation). */
  opex_yen: number;
  /** Capital expenditure / investing cash outflow (not P/L expense). */
  capex_yen: number;
  /** Non-cash P/L expense. */
  depreciation_yen: number;
};

export type MonthlyExpenseLine = {
  category?: string;
  amount?: number;
  notes?: string;
  property_id?: string;
};

export type MonthlyRevenueLine = {
  amount?: number;
  property_id?: string;
};

export function emptyMonthlyAxis(): MonthlyAxisTotals {
  return {
    revenue_yen: 0,
    opex_yen: 0,
    capex_yen: 0,
    depreciation_yen: 0,
  };
}

export function addMonthlyAxis(
  a: MonthlyAxisTotals,
  b: MonthlyAxisTotals,
): MonthlyAxisTotals {
  return {
    revenue_yen: a.revenue_yen + b.revenue_yen,
    opex_yen: a.opex_yen + b.opex_yen,
    capex_yen: a.capex_yen + b.capex_yen,
    depreciation_yen: a.depreciation_yen + b.depreciation_yen,
  };
}

/** Depreciation: explicit category or legacy notes containing 減価償却. */
export function isDepreciationExpense(row: {
  category?: string;
  notes?: string;
}): boolean {
  if (row.category === "depreciation") return true;
  return /減価償却/.test(row.notes ?? "");
}

export function isCapexExpense(row: { category?: string }): boolean {
  return row.category === "capex";
}

/**
 * Classify one expense amount into OPEX / CAPEX / depreciation.
 * Amounts are taken as absolute values (sign-agnostic).
 */
export function classifyExpenseAmount(row: MonthlyExpenseLine): {
  opex_yen: number;
  capex_yen: number;
  depreciation_yen: number;
} {
  const amount = Math.abs(row.amount ?? 0);
  if (isCapexExpense(row)) {
    return { opex_yen: 0, capex_yen: amount, depreciation_yen: 0 };
  }
  if (isDepreciationExpense(row)) {
    return { opex_yen: 0, capex_yen: 0, depreciation_yen: amount };
  }
  return { opex_yen: amount, capex_yen: 0, depreciation_yen: 0 };
}

export function axisFromMonthlyLines(opts: {
  revenue?: MonthlyRevenueLine[];
  expenses?: MonthlyExpenseLine[];
  /** When set, only lines with matching property_id are included. */
  propertyId?: string;
}): MonthlyAxisTotals {
  const out = emptyMonthlyAxis();
  for (const row of opts.revenue ?? []) {
    if (opts.propertyId != null && row.property_id !== opts.propertyId) continue;
    out.revenue_yen += row.amount ?? 0;
  }
  for (const row of opts.expenses ?? []) {
    if (opts.propertyId != null && row.property_id !== opts.propertyId) continue;
    const part = classifyExpenseAmount(row);
    out.opex_yen += part.opex_yen;
    out.capex_yen += part.capex_yen;
    out.depreciation_yen += part.depreciation_yen;
  }
  return out;
}

/** revenue − OPEX − depreciation (CAPEX excluded). */
export function operatingProfitProxyYen(axis: MonthlyAxisTotals): number {
  return axis.revenue_yen - axis.opex_yen - axis.depreciation_yen;
}

/**
 * Cash-relevant expense outflow from monthly YAML lines:
 * OPEX + CAPEX (depreciation excluded — non-cash).
 */
export function cashExpenseOutflowYen(axis: MonthlyAxisTotals): number {
  return axis.opex_yen + axis.capex_yen;
}
