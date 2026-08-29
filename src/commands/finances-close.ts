import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadChartOfAccounts, loadYojitsuFyPlan } from "../lib/data.js";
import { postDepreciationJournalEntries } from "../lib/finance/depreciation.js";
import { buildMonthlyReconcileReport } from "../lib/finance/ledger/monthly-reconcile.js";
import { buildTrialBalance } from "../lib/finance/ledger/trial-balance.js";
import { postPayrollJournalEntry, postMonthlyPlJournalEntries } from "../lib/finance/journal-sources.js";
import { appendJournalEntry, loadJournalEntries } from "../lib/finance/expense-claim-journal.js";
import { getDocsReportsDir } from "../lib/utils.js";
import { lockMonth } from "../lib/finance/period-lock.js";
import { resolveJournalSourceAccounts } from "../lib/finance/journal-source-accounts.js";
import { resolveCloseAdjustmentAmountFromCoa } from "../lib/finance/close-adjustments.js";
import { computePayrollMonth } from "../lib/finance/payroll-jp.js";
import { loadPayroll } from "../lib/data.js";
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

function hasDuplicateCloseLines(input: {
  debit: string;
  credit: string;
  amount: number;
}): boolean {
  const entries = loadJournalEntries().entries;
  return entries.some((entry) => {
    const dr = entry.lines.some(
      (line) =>
        line.account_code === input.debit &&
        line.debit_yen === input.amount &&
        line.credit_yen === 0,
    );
    const cr = entry.lines.some(
      (line) =>
        line.account_code === input.credit &&
        line.credit_yen === input.amount &&
        line.debit_yen === 0,
    );
    return dr && cr;
  });
}

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

  const coa = loadChartOfAccounts();
  const posted: string[] = [];

  if (opts.postDepreciation ?? true) {
    posted.push(
      ...postDepreciationJournalEntries({
        period: month,
        authorizedBy: auth.record.operator_id,
      }),
    );
  }

  if (opts.postPayroll ?? true) {
    const payroll = loadPayroll();
    const gross = payroll.employee_payroll?.monthly_gross_jpy ?? 0;
    const computed = computePayrollMonth({ month, grossYen: gross });
    const payrollEntry = postPayrollJournalEntry({
      period: month,
      authorizedBy: auth.record.operator_id,
      grossYen: computed.gross_yen,
      withholdingYen: computed.withholding_yen,
      socialEmployerYen: computed.social_insurance.employer_total_yen,
    });
    if (payrollEntry) posted.push(payrollEntry);
  }

  posted.push(
    ...postMonthlyPlJournalEntries({
      period: month,
      authorizedBy: auth.record.operator_id,
    }),
  );

  for (const adjustment of coa.monthly_close_adjustments ?? []) {
    const amount = resolveCloseAdjustmentAmountFromCoa(
      adjustment.amount_source,
      month,
    );
    if (amount <= 0) continue;
    if (
      hasDuplicateCloseLines({
        debit: adjustment.debit,
        credit: adjustment.credit,
        amount,
      })
    ) {
      continue;
    }
    const entryId = `JE-CLOSE-${month}-${adjustment.trigger}`;
    appendJournalEntry({
      entry_id: entryId,
      occurred_at: `${month}-28T12:00:00.000Z`,
      description: `Monthly close ${adjustment.trigger}`,
      source: {
        kind: "closing",
        period: month,
        adjustment_id: adjustment.trigger,
      },
      evidence_refs: [`close:${month}:${adjustment.trigger}`],
      lines: [
        {
          account_code: adjustment.debit,
          debit_yen: amount,
          credit_yen: 0,
          tax_category: "out_of_scope",
        },
        {
          account_code: adjustment.credit,
          debit_yen: 0,
          credit_yen: amount,
          tax_category: "out_of_scope",
        },
      ],
    });
    posted.push(entryId);
  }

  const trial = buildTrialBalance({ asOf: `${month}-28` });
  const reconcile = buildMonthlyReconcileReport({ month });
  const lines = [
    `# 月次決算 ${month}`,
    "",
    `posted_entries: ${posted.length}`,
    `trial_balanced: ${trial.balanced}`,
    `monthly_reconcile_balanced: ${reconcile.balanced}`,
    "",
    "## Posted",
    ...posted.map((id) => `- ${id}`),
    "",
    "## Trial balance issues",
    ...trial.issues.map((issue) => `- ${issue}`),
    "",
    "## Monthly reconcile diffs",
    ...reconcile.diffs.map(
      (diff) =>
        `- ${diff.category} (${diff.account_code}): delta ${diff.delta_yen}`,
    ),
  ];
  // Lock on trial balance only — monthly YAML reconcile is a variance memo (warning).
  if (trial.balanced) {
    lockMonth({
      month,
      lockedBy: auth.record.operator_id,
      reason: "finances close",
    });
  }
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
