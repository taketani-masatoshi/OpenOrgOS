import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadChartOfAccounts, loadYojitsuFyPlan } from "../lib/data.js";
import { buildMonthlyReconcileReport } from "../lib/finance/ledger/monthly-reconcile.js";
import { buildTrialBalance } from "../lib/finance/ledger/trial-balance.js";
import { appendJournalEntry } from "../lib/finance/expense-claim-journal.js";
import { getDocsReportsDir } from "../lib/utils.js";
import { resolveJournalSourceAccounts } from "../lib/finance/journal-source-accounts.js";
import { closeAccountingMonth } from "../lib/finance/monthly-close.js";
import {
  buildOpeningBalancesFromTrialBalance,
  saveOpeningBalances,
} from "../lib/finance/ledger/opening-balance.js";
import { requireCliDataWrite } from "../lib/console-auth/cli-operator.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  lastDayOfMonth,
  nextFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../lib/finance/fiscal-year.js";

export function runFinancesClose(opts: {
  month?: string;
  fiscalYear?: string;
  operatorId?: string;
  postDepreciation?: boolean;
  postPayroll?: boolean;
  output?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "finances close",
    permission: "finance:reconcile",
  });

  if (opts.fiscalYear) {
    runAnnualClose(opts.fiscalYear, auth.record.operator_id, opts.output);
    return;
  }

  const month = opts.month;
  if (!month) {
    console.error("Provide --month YYYY-MM or --fiscal-year");
    process.exit(1);
  }

  const closed = closeAccountingMonth({
    month,
    operatorId: auth.record.operator_id,
    postDepreciation: opts.postDepreciation,
    postPayroll: opts.postPayroll,
  });
  const trialItem = closed.evaluation.items.find((item) => item.id === "trial-balance");
  const reconcileItem = closed.evaluation.items.find(
    (item) => item.id === "monthly-reconcile",
  );
  const lines = [
    `# 月次決算 ${month}`,
    "",
    `as_of: ${closed.evaluation.as_of}`,
    `posted_entries: ${closed.posted_entry_ids.length}`,
    `trial_balanced: ${trialItem?.pass === true}`,
    `monthly_reconcile_balanced: ${reconcileItem?.pass === true}`,
    `can_lock: ${closed.evaluation.can_lock}`,
    `locked: ${closed.locked}`,
    "",
    "## Posted",
    ...closed.posted_entry_ids.map((id) => `- ${id}`),
    "",
    "## Gate errors",
    ...closed.evaluation.errors.map((issue) => `- ${issue}`),
    "",
    "## Warnings",
    ...closed.evaluation.warnings.map((issue) => `- ${issue}`),
  ];
  const md = lines.join("\n");
  if (opts.output) {
    const dir = join(getDocsReportsDir(), "agent-summaries", "accounting");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, opts.output);
    writeFileSync(path, md, "utf-8");
    console.log(`✓ ${path}`);
  } else {
    console.log(md);
  }
}

export function resolveFiscalYearCloseDates(fiscalYear: string): {
  asOf: string;
  nextFiscalYear: string;
  nextPeriodStart: string;
} {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const rawAsOf = yojitsu?.period_to;
  const asOf = rawAsOf
    ? rawAsOf.length === 7
      ? lastDayOfMonth(rawAsOf)
      : rawAsOf
    : fiscalYearEndDate(fiscalYear, endMonth);
  const nextFy = nextFiscalYear(fiscalYear);
  const nextPeriodStart = (() => {
    if (yojitsu?.period_to) {
      const end = asOf.slice(0, 7);
      const [y, m] = end.split("-").map(Number);
      const next = new Date(y, m, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    }
    return fiscalYearStartMonth(nextFy, endMonth);
  })();
  return {
    asOf,
    nextFiscalYear: nextFy,
    nextPeriodStart,
  };
}

function postAnnualPlTransfer(input: {
  fiscalYear: string;
  asOf: string;
  authorizedBy: string;
}): string | null {
  const coa = loadChartOfAccounts();
  const accounts = resolveJournalSourceAccounts(coa);
  const trial = buildTrialBalance({ asOf: input.asOf });
  const lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category?: "out_of_scope";
  }> = [];
  let revenueTotal = 0;
  let expenseTotal = 0;

  for (const row of trial.rows) {
    const account = coa.accounts.find((a) => a.code === row.account_code);
    if (!account || row.balance_yen === 0) continue;
    if (account.type === "revenue") {
      const amount = Math.abs(row.balance_yen);
      revenueTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: amount,
        credit_yen: 0,
        tax_category: "out_of_scope",
      });
    }
    if (account.type === "expense") {
      const amount = Math.abs(row.balance_yen);
      expenseTotal += amount;
      lines.push({
        account_code: row.account_code,
        debit_yen: 0,
        credit_yen: amount,
        tax_category: "out_of_scope",
      });
    }
  }

  const netToRetained = revenueTotal - expenseTotal;
  if (netToRetained > 0) {
    lines.push({
      account_code: accounts.retained_earnings,
      debit_yen: 0,
      credit_yen: netToRetained,
      tax_category: "out_of_scope",
    });
  } else if (netToRetained < 0) {
    lines.push({
      account_code: accounts.retained_earnings,
      debit_yen: -netToRetained,
      credit_yen: 0,
      tax_category: "out_of_scope",
    });
  }

  if (lines.length < 2) return null;

  const entryId = `JE-CLOSE-${input.fiscalYear}-PL-TRANSFER`;
  appendJournalEntry({
    entry_id: entryId,
    occurred_at: `${input.asOf}T23:59:59.000Z`,
    description: `Annual P/L transfer ${input.fiscalYear}`,
    source: {
      kind: "closing",
      period: input.fiscalYear,
      adjustment_id: "pl-transfer",
    },
    evidence_refs: [`annual-close:${input.fiscalYear}`],
    lines,
  });
  return entryId;
}

function runAnnualClose(
  fiscalYear: string,
  authorizedBy: string,
  output?: string,
): void {
  const dates = resolveFiscalYearCloseDates(fiscalYear);
  postAnnualPlTransfer({
    fiscalYear,
    asOf: dates.asOf,
    authorizedBy,
  });
  const trial = buildTrialBalance({ asOf: dates.asOf });
  const reconcile = buildMonthlyReconcileReport({
    month: dates.asOf.slice(0, 7),
  });
  const opening = buildOpeningBalancesFromTrialBalance({
    fiscalYear: dates.nextFiscalYear,
    asOf: dates.asOf,
    periodStart: dates.nextPeriodStart,
    bsOnly: true,
    notes: `Generated by annual close ${fiscalYear} · authorized_by ${authorizedBy}`,
  });
  saveOpeningBalances(opening);

  const lines = [
    `# 年次決算 ${fiscalYear}`,
    "",
    `as_of: ${dates.asOf}`,
    `trial_balanced: ${trial.balanced}`,
    `monthly_reconcile_balanced: ${reconcile.balanced}`,
    `authorized_by: ${authorizedBy}`,
    `next_opening_balances: ${dates.nextFiscalYear} (${opening.lines.length} lines)`,
    "",
    "## Trial balance",
    ...trial.rows.map(
      (row) =>
        `- ${row.account_code}: balance ${row.balance_yen.toLocaleString()} JPY`,
    ),
    "",
    "## Issues",
    ...trial.issues.map((issue) => `- ${issue}`),
    ...reconcile.diffs.map(
      (diff) =>
        `- reconcile ${diff.category}: delta ${diff.delta_yen}`,
    ),
  ];
  const md = lines.join("\n");
  if (output) {
    const dir = join(getDocsReportsDir(), "agent-summaries", "accounting");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, output), md, "utf-8");
  }
  console.log(md);
}
