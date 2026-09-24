/**
 * Sole-prop month close uses the existing month gate.
 * 元入金 is equity and is left out of monthly revenue.
 * Cashbook form match requires a sole_prop_handguide pin — a corporate-only pin scores 0.
 */
import {
  diffCashbookWorkedExample,
  projectCashbookFromBooks,
  type CashbookBooksInput,
  type CashbookDisplay,
  type CashbookExampleRow,
} from "./ledger/cashbook-display.js";
import { evaluateMonthlyCloseGates } from "./monthly-close.js";

export const SOLE_PROP_CASHBOOK_PIN_KIND = "sole_prop_handguide" as const;

export type SolePropCashbookPin = {
  kind: string;
  rows: readonly CashbookExampleRow[];
};

export type MonthRevenueLine = {
  account_code: string;
  credit_yen: number;
  debit_yen: number;
};

export type MonthRevenueAccount = {
  code: string;
  name: string;
  type: string;
};

export function monthRevenueExcludingOwnerCapital(input: {
  lines: MonthRevenueLine[];
  accounts: MonthRevenueAccount[];
  ownerCapitalCode: string;
}): { revenue_yen: number; owner_capital_in_revenue: boolean } {
  let revenue = 0;
  let ownerCapitalInRevenue = false;
  for (const line of input.lines) {
    const account = input.accounts.find((row) => row.code === line.account_code);
    if (!account) continue;
    const net = line.credit_yen - line.debit_yen;
    const isOwnerCapital =
      account.code === input.ownerCapitalCode || account.name === "元入金";
    if (isOwnerCapital) {
      if (account.type === "revenue") ownerCapitalInRevenue = true;
      continue;
    }
    if (account.type === "revenue") revenue += net;
  }
  return { revenue_yen: revenue, owner_capital_in_revenue: ownerCapitalInRevenue };
}

export function evaluateSolePropMonthlyClose(month: string): {
  can_lock: boolean;
  bank_gate_failed: boolean;
  errors: string[];
} {
  const evaluation = evaluateMonthlyCloseGates(month, {
    requireDepreciation: false,
    requirePayroll: false,
  });
  const bankGateFailed = evaluation.items.some(
    (item) =>
      (item.id === "bank-imported" || item.id === "bank-gl-tieout" || item.id === "bank-unmatched") &&
      item.level === "error" &&
      !item.pass,
  );
  return {
    can_lock: evaluation.can_lock,
    bank_gate_failed: bankGateFailed,
    errors: evaluation.errors,
  };
}

/** Books projection shared with the corporate cashbook emitter. */
export function projectSolePropCashbookFromBooks(input: CashbookBooksInput): CashbookDisplay {
  return projectCashbookFromBooks(input);
}

/**
 * 1 only when the pin is the sole-prop handguide kind and the books display
 * has an empty row diff. A corporate monthly-close pin (wrong kind) scores 0.
 */
export function scoreSolePropCashbookForm(
  display: CashbookDisplay,
  pin: SolePropCashbookPin | null | undefined,
): 0 | 1 {
  if (!pin || pin.kind !== SOLE_PROP_CASHBOOK_PIN_KIND) return 0;
  if (!Array.isArray(pin.rows) || pin.rows.length === 0) return 0;
  return diffCashbookWorkedExample(display, pin.rows).length === 0 ? 1 : 0;
}

export function solePropCashbookFormMet(
  display: CashbookDisplay,
  pin: SolePropCashbookPin | null | undefined,
): boolean {
  return scoreSolePropCashbookForm(display, pin) === 1;
}
