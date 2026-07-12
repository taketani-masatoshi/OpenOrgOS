import type {
  ArApEntry,
  BankStatementFile,
  CashflowScheduleRow,
} from "../../../schemas/jp-bank-corporate.js";
import type { CashBalance } from "../../../schemas/finance/balance-assets.js";
import type { ReconciliationState } from "./reconciliation.js";

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "91+";

export interface AgingRow {
  ar_ap_id: string;
  kind: ArApEntry["kind"];
  due_date: string;
  remaining_amount: number;
  bucket: AgingBucket;
}

function wholeDays(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86_400_000
  );
}

export function buildArApAging(
  state: ReconciliationState,
  asOf: string
): AgingRow[] {
  return [...state.ar_ap.values()]
    .filter((item) => item.remaining_amount > 0 && item.status !== "cancelled")
    .map((item) => {
      const overdueDays = Math.max(0, wholeDays(item.entry.due_date, asOf));
      const bucket: AgingBucket =
        item.entry.due_date >= asOf
          ? "current"
          : overdueDays <= 30
            ? "1-30"
            : overdueDays <= 60
              ? "31-60"
              : overdueDays <= 90
                ? "61-90"
                : "91+";
      return {
        ar_ap_id: item.entry.id,
        kind: item.entry.kind,
        due_date: item.entry.due_date,
        remaining_amount: item.remaining_amount,
        bucket,
      };
    })
    .sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        a.ar_ap_id.localeCompare(b.ar_ap_id)
    );
}

export interface TieOutResult {
  status: "passed" | "failed" | "not_available";
  as_of?: string;
  accounts: Array<{
    account_id: string;
    expected_closing: number;
    reported_closing: number;
    difference: number;
  }>;
  errors: string[];
}

export function tieOutBankStatements(
  statements: BankStatementFile,
  cashBalance: CashBalance
): TieOutResult {
  const batches = statements.import_batches.filter(
    (batch) =>
      batch.period_end === cashBalance.as_of &&
      batch.account_id &&
      batch.opening_balance != null &&
      batch.closing_balance != null
  );
  if (batches.length === 0) {
    return { status: "not_available", accounts: [], errors: [] };
  }
  const balanceByAccount = new Map(
    cashBalance.accounts
      .filter((account) => account.amount != null)
      .map((account) => [
        account.bank_account_id ?? account.id ?? "",
        account.amount ?? 0,
      ])
  );
  const accounts: TieOutResult["accounts"] = [];
  const errors: string[] = [];
  for (const batch of batches) {
    const ids = new Set(batch.entry_ids);
    const movement = statements.entries
      .filter((entry) => ids.has(entry.id))
      .reduce(
        (sum, entry) =>
          sum + (entry.direction === "inflow" ? entry.amount : -entry.amount),
        0
      );
    const expected = (batch.opening_balance ?? 0) + movement;
    const reported = batch.closing_balance ?? 0;
    const accountBalance = balanceByAccount.get(batch.account_id!);
    const difference = expected - reported;
    accounts.push({
      account_id: batch.account_id!,
      expected_closing: expected,
      reported_closing: reported,
      difference,
    });
    if (difference !== 0) {
      errors.push(`${batch.id}: statement movements do not equal closing balance`);
    }
    if (accountBalance == null || accountBalance !== reported) {
      errors.push(`${batch.id}: cash-balance does not equal statement closing balance`);
    }
  }
  return {
    status: errors.length === 0 ? "passed" : "failed",
    as_of: cashBalance.as_of,
    accounts,
    errors,
  };
}

export interface VarianceRow {
  category: string;
  planned_amount: number;
  actual_amount: number;
  variance_amount: number;
}

export function buildCashflowVariance(
  plannedRows: CashflowScheduleRow[],
  actualRows: CashflowScheduleRow[]
): VarianceRow[] {
  const categories = new Map<string, { planned: number; actual: number }>();
  for (const row of plannedRows) {
    const value = categories.get(row.category) ?? { planned: 0, actual: 0 };
    value.planned += row.planned_amount;
    categories.set(row.category, value);
  }
  for (const row of actualRows) {
    const value = categories.get(row.category) ?? { planned: 0, actual: 0 };
    value.actual += row.actual_amount ?? 0;
    categories.set(row.category, value);
  }
  return [...categories.entries()]
    .map(([category, value]) => ({
      category,
      planned_amount: value.planned,
      actual_amount: value.actual,
      variance_amount: value.actual - value.planned,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}
