import {
  loadCashBalance,
  loadFixedAssets,
  loadLoans,
  resolveCashBalanceTotal,
} from "../../data.js";
import { loadOpeningBalances } from "./opening-balance.js";
import { buildTrialBalance } from "./trial-balance.js";
import {
  bankStatementNetMovement,
  loadBankStatementsLite,
} from "../bank-statements-lite.js";
import { resolveJournalSourceAccounts } from "../journal-source-accounts.js";

export type ControlReconcileIssue = {
  level: "error" | "warning";
  message: string;
};

/** The imported statement set must cover the month end; row matching is enforced by the close gate. */
export function bankControlIntegrityIssuesAt(asOf: string): ControlReconcileIssue[] {
  const bank = loadBankStatementsLite();
  if (!bank) return [{ level: "error", message: "bank-statements missing" }];
  if (!bank.as_of || bank.as_of < asOf) {
    return [{ level: "error", message: `bank-statements coverage ${bank.as_of ?? "missing"} does not reach ${asOf}` }];
  }
  const month = asOf.slice(0, 7);
  const monthEntries = bank.entries.filter((entry) => entry.date.slice(0, 7) === month && entry.status !== "voided");
  const batches = bank.import_batches.filter((batch) => batch.period_end === asOf);
  if (batches.length === 0) return [{ level: "error", message: `bank-statements has no balance-certified import batch ending ${asOf}` }];
  const allActiveEntries = new Map(bank.entries.filter((entry) => entry.status !== "voided").map((entry) => [entry.id, entry]));
  const entryBatch = new Map<string, string>();
  const covered = new Set<string>();
  const issues: ControlReconcileIssue[] = [];
  for (const batch of batches) {
    for (const id of batch.entry_ids) {
      const prior = entryBatch.get(id);
      if (prior) issues.push({ level: "error", message: `bank statement entry ${id} is reused by batches ${prior} and ${batch.id}` });
      else entryBatch.set(id, batch.id);
      covered.add(id);
      const entry = allActiveEntries.get(id);
      if (!entry) {
        issues.push({ level: "error", message: `bank import batch ${batch.id} references missing or voided entry ${id}` });
        continue;
      }
      if (entry.date.slice(0, 7) !== month || entry.date < (batch.period_start ?? `${month}-01`) || entry.date > asOf) {
        issues.push({ level: "error", message: `bank import batch ${batch.id} contains out-of-period entry ${id} (${entry.date})` });
      }
      if (entry.account_id !== batch.account_id) {
        issues.push({ level: "error", message: `bank import batch ${batch.id} account ${batch.account_id ?? "missing"} does not match entry ${id} account ${entry.account_id ?? "missing"}` });
      }
    }
  }
  const uncovered = monthEntries.filter((entry) => !covered.has(entry.id));
  if (uncovered.length > 0) issues.push({ level: "error", message: `bank-statements has ${uncovered.length} month rows outside a balance-certified batch` });
  const closingByChart = new Map<string, number>();
  for (const batch of batches) {
    if (batch.opening_balance == null || batch.closing_balance == null || !batch.account_id) {
      issues.push({ level: "error", message: `bank import batch ${batch.id} lacks account/opening/closing balance` });
      continue;
    }
    if (!batch.period_start || batch.period_start.slice(0, 7) !== month || batch.period_start > asOf) {
      issues.push({ level: "error", message: `bank import batch ${batch.id} has an invalid period_start for ${month}` });
    }
    const entries = batch.entry_ids.map((id) => allActiveEntries.get(id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const charts = new Set(entries.map((entry) => entry.chart_account_id).filter((value): value is string => Boolean(value)));
    if (charts.size !== 1 || entries.some((entry) => !entry.chart_account_id)) {
      issues.push({ level: "error", message: `bank import batch ${batch.id} must map every entry to exactly one chart account` });
    }
    const movement = entries.reduce((sum, entry) => sum + (entry.direction === "inflow" ? entry.amount : -entry.amount), 0);
    if (batch.opening_balance + movement !== batch.closing_balance) {
      issues.push({ level: "error", message: `bank import batch ${batch.id}: opening + movement != closing` });
    }
    const chart = [...charts][0] ?? resolveJournalSourceAccounts().bank_control;
    closingByChart.set(chart, (closingByChart.get(chart) ?? 0) + batch.closing_balance);
  }
  const opening = loadOpeningBalances();
  if (!opening?.as_of || asOf >= opening.as_of) {
    for (const [chart, closing] of closingByChart) {
      const gl = tbBalance(chart, asOf);
      if (gl !== closing) issues.push({ level: "error", message: `bank-statements ${chart}: GL ${gl} != bank closing ${closing} (${asOf})` });
    }
  }
  return issues;
}

function tbBalance(
  accountCode: string,
  asOf?: string,
): number {
  return (
    buildTrialBalance({ asOf }).rows.find((row) => row.account_code === accountCode)
      ?.balance_yen ?? 0
  );
}

function openingBalance(accountCode: string): number | undefined {
  const opening = loadOpeningBalances();
  const line = opening?.lines.find((row) => row.account_code === accountCode);
  if (!line) return undefined;
  return line.debit_yen - line.credit_yen;
}

function faAccountForCategory(category: string): string | undefined {
  if (category.includes("土地")) return "1210";
  if (category.includes("建物")) return "1200";
  return undefined;
}

/** Cash / FA / loan registers vs GL. FA accum rollforward lag is a warning. */
export function controlAccountIntegrityIssues(): ControlReconcileIssue[] {
  const issues: ControlReconcileIssue[] = [];

  try {
    const cash = loadCashBalance();
    const cashTotal = cash ? resolveCashBalanceTotal(cash) : null;
    if (cash && cashTotal != null) {
      const opening = loadOpeningBalances();
      // Pre-cutover cash snapshot seeds opening 1100; compare to opening, not TB without opening.
      if (opening?.as_of && cash.as_of < opening.as_of) {
        const open1100 = openingBalance("1100");
        if (open1100 != null && open1100 !== cashTotal) {
          issues.push({
            level: "error",
            message: `cash 1100: opening ${open1100} != cash-balance ${cashTotal} (as_of ${cash.as_of})`,
          });
        }
      } else {
        const gl = tbBalance("1100", cash.as_of);
        if (gl !== cashTotal) {
          issues.push({
            level: "error",
            message: `cash 1100: GL ${gl} != cash-balance ${cashTotal} (as_of ${cash.as_of})`,
          });
        }
      }
    }
  } catch {
    /* cash-balance optional */
  }

  try {
    const fa = loadFixedAssets();
    const byAccount = new Map<string, { cost: number; accum: number }>();
    for (const asset of fa.assets) {
      const code = faAccountForCategory(asset.category);
      if (!code) continue;
      const cur = byAccount.get(code) ?? { cost: 0, accum: 0 };
      cur.cost += asset.acquisition_cost;
      cur.accum += asset.accumulated_depreciation;
      byAccount.set(code, cur);
    }
    for (const [code, row] of byAccount) {
      const open = openingBalance(code);
      const openingFile = loadOpeningBalances();
      const glAsOf =
        openingFile?.as_of && fa.as_of < openingFile.as_of
          ? openingFile.as_of
          : fa.as_of;
      const gl = tbBalance(code, glAsOf);
      if (open != null && Math.abs(open) !== row.cost) {
        issues.push({
          level: "warning",
          message: `fixed-assets ${code}: opening ${Math.abs(open)} != register cost ${row.cost}`,
        });
        continue;
      }
      if (gl !== row.cost) {
        issues.push({
          level: "error",
          message: `fixed-assets ${code}: GL ${gl} != register cost ${row.cost} (as_of ${glAsOf})`,
        });
      }
    }
    const faAccum = fa.assets.reduce((sum, asset) => sum + asset.accumulated_depreciation, 0);
    const opening1290 = openingBalance("1290");
    if (opening1290 != null && Math.abs(opening1290) !== faAccum) {
      issues.push({
        level: "error",
        message: `fixed-assets 1290: opening ${Math.abs(opening1290)} != register accum ${faAccum}`,
      });
    }
    const openingFile = loadOpeningBalances();
    const today = new Date().toISOString().slice(0, 10);
    const liveAsOf =
      openingFile?.as_of && today < openingFile.as_of ? openingFile.as_of : today;
    const live1290 = Math.abs(tbBalance("1290", liveAsOf));
    if (live1290 !== faAccum) {
      issues.push({
        level: "warning",
        message: `fixed-assets 1290: live GL ${live1290} != register accum ${faAccum} (rollforward)`,
      });
    }
  } catch {
    /* fixed-assets optional */
  }

  try {
    const loans = loadLoans();
    const byAccount = new Map<string, number>();
    for (const loan of loans.loans) {
      const code = loan.account_code_liability ?? "2100";
      byAccount.set(code, (byAccount.get(code) ?? 0) + loan.balance);
    }
    const opening = loadOpeningBalances();
    const asOf = opening?.as_of;
    for (const [code, register] of byAccount) {
      const gl = Math.abs(tbBalance(code, asOf));
      if (gl !== register) {
        issues.push({
          level: "error",
          message: `loans ${code}: GL ${gl} != register ${register}`,
        });
      }
    }
    for (const code of ["2100", "1300"]) {
      if (byAccount.has(code)) continue;
      const gl = Math.abs(tbBalance(code, asOf));
      if (gl !== 0) {
        issues.push({
          level: "warning",
          message: `loans ${code}: GL ${gl} has no matching loan register`,
        });
      }
    }
  } catch {
    /* loans optional */
  }

  try {
    const bank = loadBankStatementsLite();
    const opening = loadOpeningBalances();
    if (bank && opening?.as_of) {
      const cashCode = resolveJournalSourceAccounts().bank_control;
      if (!bank.as_of || bank.as_of < opening.as_of) {
        issues.push({
          level: "warning",
          message:
            `bank-statements as_of ${bank.as_of ?? "missing"} precedes opening ${opening.as_of}; ` +
            `GL↔bank delta for ${cashCode} skipped — import statements through ${opening.as_of}`,
        });
      } else {
        const openCash = openingBalance(cashCode) ?? 0;
        const glCash = tbBalance(cashCode, bank.as_of);
        const glDelta = glCash - openCash;
        const bankNet = bankStatementNetMovement(bank, opening.as_of, bank.as_of);
        if (glDelta !== bankNet) {
          issues.push({
            level: "error",
            message: `bank-statements ${cashCode}: GL delta ${glDelta} != bank net ${bankNet} (${opening.as_of}→${bank.as_of})`,
          });
        }
      }
    }
  } catch {
    /* bank-statements optional */
  }

  return issues;
}
