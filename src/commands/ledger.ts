import { readFileSync } from "node:fs";
import YAML from "yaml";
import {
  appendJournalEntry,
  loadJournalEntries,
} from "../lib/finance/expense-claim-journal.js";
import {
  buildOpeningBalancesFromTrialBalance,
  saveOpeningBalances,
} from "../lib/finance/ledger/opening-balance.js";
import { loadYojitsuFyPlan } from "../lib/data.js";
import {
  buildGeneralLedger,
  listJournalEntries,
} from "../lib/finance/ledger/general-ledger.js";
import { buildMonthlyReconcileReport } from "../lib/finance/ledger/monthly-reconcile.js";
import { buildTrialBalance } from "../lib/finance/ledger/trial-balance.js";
import {
  journalEntrySchema,
  journalSourceSchema,
} from "../../schemas/finance/journal-entry.js";
import { backfillJournalTaxCategories } from "../lib/finance/journal-tax-backfill.js";
import { backfillJournalAuditTrail } from "../lib/finance/journal-audit-backfill.js";
import { postDepreciationJournalEntries } from "../lib/finance/depreciation.js";
import {
  postMonthlyPlJournalEntries,
  postRemittanceJournalEntry,
  postArReceiptJournalEntry,
  postApPaymentJournalEntry,
  postPayrollPaymentJournalEntry,
  type RemittanceObligation,
} from "../lib/finance/journal-sources.js";
import { resolveRemittanceFromCalendarRow } from "../lib/finance/remittance-from-calendar.js";
import {
  runLedgerExportTemplate,
  type LedgerExportTemplate,
} from "../lib/finance/ledger/journal-export.js";
import { buildBalanceSheet } from "../lib/finance/ledger/balance-sheet.js";
import { buildSubsidiaryLedger } from "../lib/finance/ledger/subsidiary-ledger.js";
import { reverseJournalEntry } from "../lib/finance/journal-reverse.js";
import { lockMonth, unlockMonth } from "../lib/finance/period-lock.js";
import {
  buildElectronicLedgerComplianceReport,
  searchElectronicLedger,
} from "../lib/finance/ledger/electronic-ledger.js";
import { auditCliMutation, requireCliDataWrite } from "../lib/console-auth/cli-operator.js";
import {
  fiscalYearEndDate,
  fiscalYearStartMonth,
  lastDayOfMonth,
  nextFiscalYear,
  resolveCompanyFiscalYearEndMonth,
} from "../lib/finance/fiscal-year.js";

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function runLedgerJournalList(opts: {
  from?: string;
  to?: string;
  account?: string;
  source?: string;
  json?: boolean;
}): void {
  const entries = listJournalEntries({
    from: opts.from,
    to: opts.to,
    accountCode: opts.account,
    sourceKind: opts.source,
  });
  if (opts.json) {
    printJson({ count: entries.length, entries });
    return;
  }
  console.log(`# 仕訳一覧 (${entries.length})\n`);
  for (const entry of entries) {
    console.log(
      `${entry.entry_id} · ${entry.occurred_at.slice(0, 10)} · ${entry.description}`,
    );
  }
}

export function runLedgerPost(opts: {
  file?: string;
  source?: string;
  month?: string;
  operatorId?: string;
  obligation?: string;
  counterparty?: string;
  amount?: string;
  fromCalendar?: string;
}): void {
  if (opts.source) {
    runLedgerPostSource({
      source: opts.source,
      month: opts.month,
      operatorId: opts.operatorId,
      obligation: opts.obligation,
      counterparty: opts.counterparty,
      amount: opts.amount,
      fromCalendar: opts.fromCalendar,
    });
    return;
  }
  if (!opts.file) {
    throw new Error("Provide --file or --source");
  }
  const auth = requireCliDataWrite({
    command: "ledger post",
    permission: "finance:reconcile",
  });
  const raw = YAML.parse(readFileSync(opts.file, "utf-8"));
  const entry = journalEntrySchema.parse(raw);
  if (entry.source?.kind === "manual") {
    if (entry.source.authorized_by !== auth.record.operator_id) {
      throw new Error("manual journal authorized_by must match operator id");
    }
  } else if (!entry.source) {
    const source = journalSourceSchema.safeParse({
      kind: "manual",
      authorized_by: auth.record.operator_id,
    });
    if (source.success) {
      entry.source = source.data;
    }
  }
  const saved = appendJournalEntry(entry, { postedBy: auth.record.operator_id });
  auditCliMutation("ledger post", saved.entry_id);
  console.log(`✓ posted ${saved.entry_id}`);
}

export function runLedgerPostSource(opts: {
  source: string;
  month?: string;
  operatorId?: string;
  obligation?: string;
  counterparty?: string;
  amount?: string;
  fromCalendar?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "ledger post",
    permission: "finance:reconcile",
  });
  if (opts.source === "depreciation") {
    if (!opts.month) {
      throw new Error("--month YYYY-MM is required for --source depreciation");
    }
    const posted = postDepreciationJournalEntries({
      period: opts.month,
      authorizedBy: auth.record.operator_id,
    });
    for (const id of posted) {
      auditCliMutation("ledger post depreciation", id);
    }
    console.log(`✓ posted ${posted.length} depreciation entries for ${opts.month}`);
    return;
  }
  if (opts.source === "monthly-pl") {
    if (!opts.month) {
      throw new Error("--month YYYY-MM is required for --source monthly-pl");
    }
    const depPosted = postDepreciationJournalEntries({
      period: opts.month,
      authorizedBy: auth.record.operator_id,
    });
    for (const id of depPosted) {
      auditCliMutation("ledger post depreciation", id);
    }
    const posted = postMonthlyPlJournalEntries({
      period: opts.month,
      authorizedBy: auth.record.operator_id,
    });
    for (const id of posted) {
      auditCliMutation("ledger post monthly-pl", id);
    }
    console.log(
      `✓ posted ${depPosted.length} depreciation + ${posted.length} monthly P/L entries for ${opts.month}`,
    );
    return;
  }
  if (opts.source === "remittance") {
    let period = opts.month;
    let obligation = opts.obligation as RemittanceObligation | undefined;
    if (opts.fromCalendar) {
      const resolved = resolveRemittanceFromCalendarRow({ rowId: opts.fromCalendar });
      period = period ?? resolved.period;
      obligation = obligation ?? resolved.obligation;
    }
    if (!period) {
      throw new Error("--month YYYY-MM is required for --source remittance (or --from-calendar)");
    }
    if (
      obligation !== "withholding" &&
      obligation !== "social_insurance" &&
      obligation !== "consumption_tax"
    ) {
      throw new Error(
        "--obligation withholding | social_insurance | consumption_tax is required (or --from-calendar)",
      );
    }
    const posted = postRemittanceJournalEntry({
      period,
      obligation,
      authorizedBy: auth.record.operator_id,
    });
    if (!posted) {
      console.log(`✓ remittance ${obligation} ${period}: nothing to settle`);
      return;
    }
    auditCliMutation("ledger post remittance", posted);
    console.log(`✓ posted ${posted}`);
    return;
  }
  if (opts.source === "payroll-payment") {
    if (!opts.month) {
      throw new Error("--month YYYY-MM is required for --source payroll-payment");
    }
    const amountYen = opts.amount != null ? Number(opts.amount) : undefined;
    if (opts.amount != null && (!Number.isFinite(amountYen) || (amountYen ?? 0) <= 0)) {
      throw new Error("--amount <yen> must be a positive number");
    }
    const posted = postPayrollPaymentJournalEntry({
      period: opts.month,
      authorizedBy: auth.record.operator_id,
      amountYen,
    });
    if (!posted) {
      console.log(`✓ payroll-payment ${opts.month}: nothing to pay`);
      return;
    }
    auditCliMutation("ledger post payroll-payment", posted);
    console.log(`✓ posted ${posted}`);
    return;
  }
  if (opts.source === "ar-receipt" || opts.source === "ap-payment") {
    if (!opts.month) {
      throw new Error(`--month YYYY-MM is required for --source ${opts.source}`);
    }
    if (!opts.counterparty) {
      throw new Error(`--counterparty <id> is required for --source ${opts.source}`);
    }
    const amountYen = Number(opts.amount);
    if (!Number.isFinite(amountYen) || amountYen <= 0) {
      throw new Error(`--amount <yen> is required for --source ${opts.source}`);
    }
    const stamp = opts.month.replace(/-/g, "");
    const ledgerEntryId =
      `${opts.source === "ar-receipt" ? "AR" : "AP"}-${opts.counterparty}-${stamp}-${amountYen}`
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, "-");
    const occurredAt = `${opts.month}-28T12:00:00.000Z`;
    const posted =
      opts.source === "ar-receipt"
        ? postArReceiptJournalEntry({
            ledgerEntryId,
            amountYen,
            counterpartyId: opts.counterparty,
            occurredAt,
            authorizedBy: auth.record.operator_id,
          })
        : postApPaymentJournalEntry({
            ledgerEntryId,
            amountYen,
            counterpartyId: opts.counterparty,
            occurredAt,
            authorizedBy: auth.record.operator_id,
          });
    auditCliMutation(`ledger post ${opts.source}`, posted);
    console.log(`✓ posted ${posted}`);
    return;
  }
  throw new Error(`Unknown journal source: ${opts.source}`);
}

export function runLedgerGl(opts: {
  account: string;
  from?: string;
  to?: string;
  json?: boolean;
}): void {
  const ledger = buildGeneralLedger({
    accountCode: opts.account,
    from: opts.from,
    to: opts.to,
  });
  if (opts.json) {
    printJson(ledger);
    return;
  }
  console.log(
    `# ${ledger.account_code} ${ledger.account_name} · ending ${ledger.ending_balance_yen.toLocaleString()} JPY\n`,
  );
  for (const line of ledger.lines) {
    console.log(
      `${line.occurred_at.slice(0, 10)} ${line.entry_id} D${line.debit_yen} C${line.credit_yen} bal=${line.running_balance_yen}`,
    );
  }
}

export function runLedgerTrialBalance(opts: {
  asOf?: string;
  json?: boolean;
  output?: string;
}): void {
  const report = buildTrialBalance({ asOf: opts.asOf });
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log(`# 試算表 ${report.as_of} · balanced=${report.balanced}\n`);
  console.log("| 科目 | 借方 | 貸方 | 残高 |");
  console.log("| --- | ---: | ---: | ---: |");
  for (const row of report.rows) {
    console.log(
      `| ${row.account_code} ${row.account_name} | ${row.debit_total_yen} | ${row.credit_total_yen} | ${row.balance_yen} |`,
    );
  }
  if (report.issues.length) {
    console.log("\nIssues:");
    for (const issue of report.issues) console.log(`- ${issue}`);
  }
}

export function runLedgerMonthlyReconcile(opts: {
  month: string;
  json?: boolean;
}): void {
  const report = buildMonthlyReconcileReport({ month: opts.month });
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log(`# 月次突合 ${opts.month} · balanced=${report.balanced}\n`);
  for (const diff of report.diffs) {
    console.log(
      `${diff.category} (${diff.account_code}): monthly=${diff.monthly_pl_yen} trial=${diff.trial_balance_yen} delta=${diff.delta_yen}`,
    );
  }
}

export function runLedgerJournalBackfillTax(opts: {
  dryRun?: boolean;
  json?: boolean;
}): void {
  requireCliDataWrite({
    command: "ledger journal backfill-tax",
    permission: "finance:reconcile",
  });
  const result = backfillJournalTaxCategories({ dryRun: opts.dryRun });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `tax_category backfill: ${result.updated_entries} entries, ${result.updated_lines} lines${result.dry_run ? " (dry-run)" : ""}`,
  );
}

export function runLedgerJournalBackfillAudit(opts: {
  dryRun?: boolean;
  json?: boolean;
}): void {
  requireCliDataWrite({
    command: "ledger journal backfill-audit",
    permission: "finance:reconcile",
  });
  const result = backfillJournalAuditTrail({ dryRun: opts.dryRun });
  if (opts.json) {
    printJson(result);
    return;
  }
  console.log(
    `audit trail backfill: ${result.updated_entries} entries${result.dry_run ? " (dry-run)" : ""}`,
  );
}

export function runLedgerOpeningBalanceGenerate(opts: {
  fiscalYear: string;
  asOf?: string;
  periodStart?: string;
  dryRun?: boolean;
  json?: boolean;
}): void {
  requireCliDataWrite({
    command: "ledger opening-balance generate",
    permission: "finance:reconcile",
  });
  const yojitsu = loadYojitsuFyPlan(opts.fiscalYear);
  const endMonth = resolveCompanyFiscalYearEndMonth();
  const asOf =
    opts.asOf ??
    (yojitsu?.period_to
      ? yojitsu.period_to.length === 7
        ? lastDayOfMonth(yojitsu.period_to)
        : yojitsu.period_to
      : fiscalYearEndDate(opts.fiscalYear, endMonth));
  const nextFy = nextFiscalYear(opts.fiscalYear);
  const periodStart =
    opts.periodStart ??
    (yojitsu?.period_from?.slice(0, 7) ??
      fiscalYearStartMonth(nextFy, endMonth));
  const file = buildOpeningBalancesFromTrialBalance({
    fiscalYear: opts.fiscalYear,
    asOf,
    periodStart,
    notes: "Generated from trial balance",
  });
  if (opts.json) {
    printJson(file);
    return;
  }
  if (!opts.dryRun) {
    saveOpeningBalances(file);
  }
  console.log(
    `✓ opening balances ${opts.fiscalYear}: ${file.lines.length} lines${opts.dryRun ? " (dry-run)" : ""}`,
  );
}

export function runLedgerShow(): void {
  const file = loadJournalEntries();
  console.log(`entries: ${file.entries.length}`);
}

export function runLedgerExport(opts: {
  template?: LedgerExportTemplate;
  from?: string;
  to?: string;
  asOf?: string;
  account?: string;
  source?: string;
  output?: string;
  dryRun?: boolean;
  json?: boolean;
}): void {
  runLedgerExportTemplate({
    template: opts.template,
    from: opts.from,
    to: opts.to,
    asOf: opts.asOf,
    accountCode: opts.account,
    sourceKind: opts.source,
    output: opts.output,
    dryRun: opts.dryRun,
    json: opts.json,
  });
}

export function runLedgerBalanceSheet(opts: {
  asOf?: string;
  fiscalYear?: string;
  json?: boolean;
}): void {
  const report = buildBalanceSheet({
    asOf: opts.asOf,
    fiscalYear: opts.fiscalYear,
  });
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log(`# 貸借対照表 ${report.as_of} · balanced=${report.balanced}`);
  console.log(`資産合計: ${report.total_assets_yen.toLocaleString()}`);
  console.log(`負債合計: ${report.total_liabilities_yen.toLocaleString()}`);
  console.log(`純資産合計: ${report.total_equity_yen.toLocaleString()}`);
  console.log(`当期純利益（PL）: ${report.net_income_yen.toLocaleString()}`);
}

export function runLedgerSubsidiary(opts: {
  account: string;
  asOf?: string;
  json?: boolean;
}): void {
  const report = buildSubsidiaryLedger({
    accountCode: opts.account,
    asOf: opts.asOf,
  });
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log(`# 補助元帳 ${report.account_code} ${report.account_name}`);
  for (const line of report.lines) {
    console.log(
      `${line.counterparty_id}: ${line.balance_yen.toLocaleString()} (${line.days_outstanding ?? 0}d)`,
    );
  }
}

export function runLedgerReverse(opts: {
  entryId: string;
  operatorId?: string;
  occurredAt?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "ledger reverse",
    permission: "finance:reconcile",
  });
  const reversal = reverseJournalEntry({
    entryId: opts.entryId,
    authorizedBy: auth.record.operator_id,
    occurredAt: opts.occurredAt,
  });
  const saved = appendJournalEntry(reversal, { postedBy: auth.record.operator_id });
  auditCliMutation("ledger reverse", saved.entry_id);
  console.log(`✓ reversed ${opts.entryId} → ${saved.entry_id}`);
}

export function runLedgerPeriodUnlock(opts: {
  month: string;
  operatorId?: string;
  reason?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "ledger period unlock",
    permission: "finance:reconcile",
  });
  const ok = unlockMonth({
    month: opts.month,
    unlockedBy: auth.record.operator_id,
    reason: opts.reason,
  });
  auditCliMutation("ledger period unlock", opts.month);
  if (!ok) {
    throw new Error(`Period ${opts.month} is not locked`);
  }
  console.log(`✓ unlocked period ${opts.month}`);
}

export function runLedgerPeriodLock(opts: {
  month: string;
  operatorId?: string;
  reason?: string;
}): void {
  const auth = requireCliDataWrite({
    command: "ledger period lock",
    permission: "finance:reconcile",
  });
  const entry = lockMonth({
    month: opts.month,
    lockedBy: auth.record.operator_id,
    reason: opts.reason,
  });
  auditCliMutation("ledger period lock", entry.month);
  console.log(`✓ locked period ${entry.month}`);
}

export function runLedgerDenchoSearch(opts: {
  from?: string;
  to?: string;
  minAmount?: string;
  maxAmount?: string;
  counterparty?: string;
  account?: string;
  description?: string;
  entryId?: string;
  limit?: string;
  json?: boolean;
}): void {
  const hits = searchElectronicLedger({
    from: opts.from,
    to: opts.to,
    minAmountYen: opts.minAmount != null ? Number(opts.minAmount) : undefined,
    maxAmountYen: opts.maxAmount != null ? Number(opts.maxAmount) : undefined,
    counterpartyId: opts.counterparty,
    accountCode: opts.account,
    descriptionContains: opts.description,
    entryId: opts.entryId,
    limit: opts.limit != null ? Number(opts.limit) : undefined,
  });
  if (opts.json) {
    printJson({ count: hits.length, hits });
    return;
  }
  console.log(`# 電子帳簿検索 (${hits.length} 行)\n`);
  for (const hit of hits) {
    console.log(
      `${hit.occurred_at.slice(0, 10)} ${hit.entry_id} ${hit.account_code} ` +
        `D${hit.debit_yen} C${hit.credit_yen}` +
        (hit.counterparty_id ? ` cp=${hit.counterparty_id}` : "") +
        ` — ${hit.description}`,
    );
  }
}

export function runLedgerDenchoCheck(opts: { json?: boolean }): void {
  const report = buildElectronicLedgerComplianceReport();
  if (opts.json) {
    printJson(report);
    return;
  }
  console.log("# 電子帳簿コンプライアンス");
  console.log(`entries: ${report.entry_count}`);
  console.log(`append_only: ${report.append_only_ok}`);
  console.log(`search_ok: ${report.search_index_ok}`);
  if (report.issues.length === 0) {
    console.log("✓ no issues");
    return;
  }
  for (const issue of report.issues) {
    console.log(`⚠ ${issue}`);
  }
}
