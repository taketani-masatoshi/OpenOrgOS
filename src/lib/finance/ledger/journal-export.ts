import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  journalEntrySchema,
  normalizeJournalEntry,
  type JournalEntry,
} from "../../../../schemas/finance/journal-entry.js";
import {
  buildTrialBalance,
  type TrialBalanceRow,
} from "./trial-balance.js";
import { getDocsDir } from "../../utils.js";
import { listJournalEntries } from "./general-ledger.js";
import { buildSubsidiaryLedger } from "./subsidiary-ledger.js";
import { loadChartOfAccounts } from "../../data.js";
import { buildCashFlowStatement } from "./cash-flow-statement.js";

export const JOURNAL_EXPORT_HEADER = [
  "entry_id",
  "occurred_at",
  "description",
  "account_code",
  "debit_yen",
  "credit_yen",
  "tax_category",
  "source_kind",
  "notes",
] as const;

export const TRIAL_BALANCE_EXPORT_HEADER = [
  "account_code",
  "account_name",
  "normal_balance",
  "debit_total_yen",
  "credit_total_yen",
  "balance_yen",
] as const;

export const ACCOUNT_BREAKDOWN_EXPORT_HEADER = [
  "account_code",
  "account_name",
  "counterparty_id",
  "balance_yen",
] as const;

export type LedgerExportTemplate =
  | "journal-csv"
  | "trial-balance-csv"
  | "account-breakdown-csv"
  | "cash-flow-csv";

export type JournalExportRow = {
  entry_id: string;
  occurred_at: string;
  description: string;
  account_code: string;
  debit_yen: number;
  credit_yen: number;
  tax_category: string;
  source_kind: string;
  notes: string;
};

function csvEscape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeCsv(path: string, header: readonly string[], rows: (string | number)[][]): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
}

function sourceKind(entry: JournalEntry): string {
  return entry.source?.kind ?? "";
}

function exportNotes(entry: JournalEntry): string {
  if (entry.source?.kind === "expense_claim") {
    return entry.source.claim_id;
  }
  if (entry.claim_id) return entry.claim_id;
  return "";
}

export function buildJournalExportRows(input?: {
  from?: string;
  to?: string;
  accountCode?: string;
  sourceKind?: string;
}): JournalExportRow[] {
  const entries = listJournalEntries({
    from: input?.from,
    to: input?.to,
    accountCode: input?.accountCode,
    sourceKind: input?.sourceKind,
  });
  const rows: JournalExportRow[] = [];
  for (const raw of entries) {
    const entry = journalEntrySchema.parse(normalizeJournalEntry(raw));
    const notes = exportNotes(entry);
    for (const line of entry.lines) {
      rows.push({
        entry_id: entry.entry_id,
        occurred_at: entry.occurred_at.slice(0, 10),
        description: entry.description,
        account_code: line.account_code,
        debit_yen: line.debit_yen,
        credit_yen: line.credit_yen,
        tax_category: line.tax_category ?? "",
        source_kind: sourceKind(entry),
        notes,
      });
    }
  }
  return rows;
}

export function formatJournalExportCsv(rows: JournalExportRow[]): string {
  const lines = [JOURNAL_EXPORT_HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.entry_id,
        row.occurred_at,
        row.description,
        row.account_code,
        row.debit_yen,
        row.credit_yen,
        row.tax_category,
        row.source_kind,
        row.notes,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function defaultJournalExportPath(): string {
  return join(getDocsDir(), "finance/accounting/records/仕訳一覧.csv");
}

export function defaultTrialBalanceExportPath(): string {
  return join(getDocsDir(), "finance/accounting/records/試算表.csv");
}

export function defaultAccountBreakdownExportPath(): string {
  return join(getDocsDir(), "finance/accounting/records/勘定科目内訳.csv");
}

export function buildAccountBreakdownRows(asOf?: string): Array<{
  account_code: string;
  account_name: string;
  counterparty_id: string;
  balance_yen: number;
}> {
  const coa = loadChartOfAccounts();
  const codes = ["1150", "2110", "1100", "2120", "2130", "2160", "2170"].filter((code) =>
    coa.accounts.some((account) => account.code === code),
  );
  const rows: Array<{
    account_code: string;
    account_name: string;
    counterparty_id: string;
    balance_yen: number;
  }> = [];
  for (const accountCode of codes) {
    try {
      const report = buildSubsidiaryLedger({ accountCode, asOf });
      for (const line of report.lines) {
        rows.push({
          account_code: report.account_code,
          account_name: report.account_name,
          counterparty_id: line.counterparty_id,
          balance_yen: line.balance_yen,
        });
      }
    } catch {
      /* skip unknown */
    }
  }
  return rows;
}

export function exportAccountBreakdownCsv(input: {
  asOf?: string;
  output?: string;
  dryRun?: boolean;
}): { path: string; rowCount: number } {
  const rows = buildAccountBreakdownRows(input.asOf);
  const path = input.output ?? defaultAccountBreakdownExportPath();
  if (input.dryRun) {
    const content = [
      ACCOUNT_BREAKDOWN_EXPORT_HEADER.join(","),
      ...rows.map((row) =>
        [row.account_code, row.account_name, row.counterparty_id, row.balance_yen]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n");
    process.stdout.write(`${content}\n`);
    return { path, rowCount: rows.length };
  }
  writeCsv(
    path,
    ACCOUNT_BREAKDOWN_EXPORT_HEADER,
    rows.map((row) => [
      row.account_code,
      row.account_name,
      row.counterparty_id,
      row.balance_yen,
    ]),
  );
  return { path, rowCount: rows.length };
}

export function buildTrialBalanceExportRows(asOf?: string): TrialBalanceRow[] {
  return buildTrialBalance({ asOf }).rows;
}

export function exportJournalCsv(input: {
  from?: string;
  to?: string;
  accountCode?: string;
  sourceKind?: string;
  output?: string;
  dryRun?: boolean;
}): { path: string; rowCount: number; entryCount: number } {
  const rows = buildJournalExportRows({
    from: input.from,
    to: input.to,
    accountCode: input.accountCode,
    sourceKind: input.sourceKind,
  });
  const entryIds = new Set(rows.map((row) => row.entry_id));
  const content = formatJournalExportCsv(rows);
  const path = input.output ?? defaultJournalExportPath();

  if (input.dryRun) {
    process.stdout.write(content);
    return { path, rowCount: rows.length, entryCount: entryIds.size };
  }

  writeCsv(
    path,
    JOURNAL_EXPORT_HEADER,
    rows.map((row) => [
      row.entry_id,
      row.occurred_at,
      row.description,
      row.account_code,
      row.debit_yen,
      row.credit_yen,
      row.tax_category,
      row.source_kind,
      row.notes,
    ]),
  );
  return { path, rowCount: rows.length, entryCount: entryIds.size };
}

export function exportTrialBalanceCsv(input: {
  asOf?: string;
  output?: string;
  dryRun?: boolean;
}): { path: string; rowCount: number; balanced: boolean } {
  const report = buildTrialBalance({ asOf: input.asOf });
  const path = input.output ?? defaultTrialBalanceExportPath();
  const rows = report.rows.map((row) => [
    row.account_code,
    row.account_name,
    row.normal_balance,
    row.debit_total_yen,
    row.credit_total_yen,
    row.balance_yen,
  ]);

  if (input.dryRun) {
    const content = [
      TRIAL_BALANCE_EXPORT_HEADER.join(","),
      ...rows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");
    process.stdout.write(`${content}\n`);
    return { path, rowCount: rows.length, balanced: report.balanced };
  }

  writeCsv(path, TRIAL_BALANCE_EXPORT_HEADER, rows);
  return { path, rowCount: rows.length, balanced: report.balanced };
}

export function runLedgerExportTemplate(input: {
  template?: LedgerExportTemplate;
  from?: string;
  to?: string;
  asOf?: string;
  accountCode?: string;
  sourceKind?: string;
  output?: string;
  dryRun?: boolean;
  json?: boolean;
}): void {
  const template = input.template ?? "journal-csv";
  if (template === "account-breakdown-csv") {
    if (input.json) {
      const rows = buildAccountBreakdownRows(input.asOf);
      console.log(JSON.stringify({ row_count: rows.length, rows }, null, 2));
      return;
    }
    const result = exportAccountBreakdownCsv({
      asOf: input.asOf,
      output: input.output,
      dryRun: input.dryRun,
    });
    if (!input.dryRun) {
      console.log(`✓ exported account breakdown ${result.rowCount} rows → ${result.path}`);
    }
    return;
  }
  if (template === "cash-flow-csv") {
    const report = buildCashFlowStatement({ asOf: input.asOf });
    if (input.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const lines = [
      "section,label,amount_yen",
      ...report.operating.map((row) => `operating,${csvEscape(row.label)},${row.amount_yen}`),
      ...report.investing.map((row) => `investing,${csvEscape(row.label)},${row.amount_yen}`),
      ...report.financing.map((row) => `financing,${csvEscape(row.label)},${row.amount_yen}`),
      `summary,net_cash_change,${report.net_cash_change_yen}`,
      `summary,cash_begin,${report.cash_begin_yen}`,
      `summary,cash_end,${report.cash_end_yen}`,
    ];
    if (input.dryRun) {
      console.log(lines.join("\n"));
      return;
    }
    const path =
      input.output ??
      join(getDocsDir(), "finance", "accounting", "records", exportFilename(template, input.asOf));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
    console.log(`✓ exported cash flow → ${path}`);
    return;
  }
  if (template === "trial-balance-csv") {
    if (input.json) {
      const report = buildTrialBalance({ asOf: input.asOf });
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    const result = exportTrialBalanceCsv({
      asOf: input.asOf,
      output: input.output,
      dryRun: input.dryRun,
    });
    if (!input.dryRun) {
      console.log(
        `✓ exported trial balance ${result.rowCount} accounts (balanced=${result.balanced}) → ${result.path}`,
      );
    }
    return;
  }

  if (input.json) {
    const rows = buildJournalExportRows({
      from: input.from,
      to: input.to,
      accountCode: input.accountCode,
      sourceKind: input.sourceKind,
    });
    console.log(
      JSON.stringify(
        {
          row_count: rows.length,
          entry_count: new Set(rows.map((row) => row.entry_id)).size,
          rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = exportJournalCsv({
    from: input.from,
    to: input.to,
    accountCode: input.accountCode,
    sourceKind: input.sourceKind,
    output: input.output,
    dryRun: input.dryRun,
  });
  if (!input.dryRun) {
    console.log(
      `✓ exported ${result.rowCount} lines (${result.entryCount} entries) → ${result.path}`,
    );
  }
}

export type LedgerExportHttpResult = {
  filename: string;
  content: string;
  contentType: string;
  rowCount: number;
};

function exportFilename(template: LedgerExportTemplate, asOf?: string): string {
  const stamp = (asOf ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  if (template === "trial-balance-csv") return `trial-balance-${stamp}.csv`;
  if (template === "account-breakdown-csv") return `account-breakdown-${stamp}.csv`;
  if (template === "cash-flow-csv") return `cash-flow-${stamp}.csv`;
  return `journal-export-${stamp}.csv`;
}

/** In-memory CSV for HTTP download (no filesystem write). */
export function renderLedgerExportHttp(input: {
  template: LedgerExportTemplate;
  from?: string;
  to?: string;
  asOf?: string;
  accountCode?: string;
  sourceKind?: string;
}): LedgerExportHttpResult {
  const template = input.template;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);

  if (template === "account-breakdown-csv") {
    const rows = buildAccountBreakdownRows(asOf);
    const content = [
      ACCOUNT_BREAKDOWN_EXPORT_HEADER.join(","),
      ...rows.map((row) =>
        [row.account_code, row.account_name, row.counterparty_id, row.balance_yen]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n");
    return {
      filename: exportFilename(template, asOf),
      content: `${content}\n`,
      contentType: "text/csv; charset=utf-8",
      rowCount: rows.length,
    };
  }

  if (template === "trial-balance-csv") {
    const report = buildTrialBalance({ asOf });
    const content = [
      TRIAL_BALANCE_EXPORT_HEADER.join(","),
      ...report.rows.map((row) =>
        [
          row.account_code,
          row.account_name,
          row.normal_balance,
          row.debit_total_yen,
          row.credit_total_yen,
          row.balance_yen,
        ]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n");
    return {
      filename: exportFilename(template, asOf),
      content: `${content}\n`,
      contentType: "text/csv; charset=utf-8",
      rowCount: report.rows.length,
    };
  }

  if (template === "cash-flow-csv") {
    const report = buildCashFlowStatement({ asOf });
    const lines = [
      "section,label,amount_yen",
      ...report.operating.map((row) => `operating,${csvEscape(row.label)},${row.amount_yen}`),
      ...report.investing.map((row) => `investing,${csvEscape(row.label)},${row.amount_yen}`),
      ...report.financing.map((row) => `financing,${csvEscape(row.label)},${row.amount_yen}`),
      `summary,net_cash_change,${report.net_cash_change_yen}`,
      `summary,cash_begin,${report.cash_begin_yen}`,
      `summary,cash_end,${report.cash_end_yen}`,
    ];
    return {
      filename: exportFilename(template, asOf),
      content: `${lines.join("\n")}\n`,
      contentType: "text/csv; charset=utf-8",
      rowCount: lines.length,
    };
  }

  const rows = buildJournalExportRows({
    from: input.from,
    to: input.to,
    accountCode: input.accountCode,
    sourceKind: input.sourceKind,
  });
  return {
    filename: exportFilename("journal-csv", asOf),
    content: formatJournalExportCsv(rows),
    contentType: "text/csv; charset=utf-8",
    rowCount: rows.length,
  };
}
