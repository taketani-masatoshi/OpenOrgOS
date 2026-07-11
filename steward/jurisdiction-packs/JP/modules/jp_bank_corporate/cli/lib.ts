import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import {
  arApLedgerFileSchema,
  cashflowScheduleSchema,
  paymentCalendarFileSchema,
  type CashflowSchedule,
  type CashflowGranularity,
  type PaymentCalendarEntry,
} from "../../../../../../schemas/jp-bank-corporate.js";
import { loadCashBalance, resolveCashBalanceTotal } from "../../../../../../src/lib/data.js";
import { getWorkspaceRoot } from "../../../../../../src/lib/tenant.js";
import {
  currentDate,
  formatCurrency,
  getDocsDir,
  writeMarkdownReport,
  writeTrackedFile,
  writeYamlFile,
} from "../../../../../../src/lib/utils.js";
import {
  buildCashflowSchedule,
  formatCashflowCsv,
  formatCashflowJson,
  formatCashflowMarkdown,
} from "./cashflow-builder.js";
import {
  loadArApLedger,
  loadCollectionTerms,
  loadPaymentCalendar,
  resolveFinanceFilePath,
} from "./data-loaders.js";
import { buildCalendarImport, type CalendarImportSource } from "./calendar-import.js";
import { buildInvoiceArApEntries, mergeArApEntries } from "./ar-ap-sync.js";
import { validateCollectionTermReferences } from "./collection-terms.js";
import { generateCashflowExport } from "./cashflow-export.js";

export const MODULE_ID = "jp_bank_corporate";

export interface JpBankCashflowGenerationResult {
  schedule: CashflowSchedule;
  content: string;
  output_path: string;
  wrote: boolean;
}

function cashflowOutputPath(
  granularity: CashflowGranularity,
  format: "md" | "csv" | "json"
): string {
  const ext = format === "csv" ? "csv" : format === "json" ? "json" : "md";
  return join(
    getDocsDir(),
    "finance",
    "treasury",
    "cashflow-schedule",
    `${currentDate()}-${granularity}.${ext}`
  );
}

function repoRelativePath(path: string): string {
  return relative(getWorkspaceRoot(), path).replace(/\\/g, "/");
}

/** Programmatic cashflow generation for CLI and operator tools. */
export function generateJpBankCashflow(opts: {
  granularity?: CashflowGranularity;
  horizon?: string;
  format?: "md" | "csv" | "json";
  write?: boolean;
}): JpBankCashflowGenerationResult {
  const granularity = opts.granularity ?? "weekly";
  const format = opts.format ?? "md";
  const schedule = buildCashflowSchedule({
    granularity,
    horizon: opts.horizon ?? "13w",
  });
  const content =
    format === "csv"
      ? formatCashflowCsv(schedule)
      : format === "json"
        ? formatCashflowJson(schedule)
        : formatCashflowMarkdown(schedule);
  const absolutePath = cashflowOutputPath(granularity, format);
  if (opts.write) writeTrackedFile(absolutePath, content);
  return {
    schedule,
    content,
    output_path: repoRelativePath(absolutePath),
    wrote: opts.write === true,
  };
}

export function runJpBankCashflowGenerate(opts: {
  granularity?: CashflowGranularity;
  horizon?: string;
  format?: "md" | "csv" | "json";
  write?: boolean;
  json?: boolean;
}): void {
  const result = generateJpBankCashflow({
    ...opts,
    write: opts.json ? false : opts.write,
  });
  const { schedule } = result;

  if (opts.json) {
    console.log(formatCashflowJson(schedule));
    return;
  }

  if (opts.write) {
    console.log(`✓ 資金繰り表 → ${result.output_path}`);
    if (schedule.shortfall_date) {
      console.log(`⚠ 資金ショート予測: ${schedule.shortfall_date}`);
    }
    return;
  }

  console.log(result.content);
}

export function runJpBankPositionShow(opts: { asOf?: string; json?: boolean }): void {
  const balance = loadCashBalance();
  const asOf = opts.asOf ?? balance?.as_of ?? currentDate();

  if (!balance) {
    console.error("cash-balance.yaml not found");
    process.exit(1);
  }

  const total = resolveCashBalanceTotal(balance);
  const byAccount = balance.accounts.map((a) => ({
    bank_account_id: a.bank_account_id ?? a.id,
    amount: a.amount,
  }));

  const payload = {
    as_of: asOf,
    status: balance.status,
    currency: balance.currency,
    total,
    accounts: byAccount,
  };

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("# キャッシュポジション\n");
  console.log(`基準日: ${asOf} · 状態: ${balance.status} · 合計: ${formatCurrency(total ?? 0)}`);
  console.log("\n| 口座 ID | 残高 |");
  console.log("|--------|-----:|");
  for (const a of byAccount) {
    console.log(`| ${a.bank_account_id ?? "—"} | ${formatCurrency(a.amount ?? 0)} |`);
  }
}

export function runJpBankCalendarValidate(): void {
  const errors: string[] = [];
  const calendar = loadPaymentCalendar();
  if (!calendar) {
    console.error("payment-calendar.yaml missing");
    process.exit(1);
  }

  const seen = new Set<string>();
  for (const entry of calendar.data.entries) {
    if (seen.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
    seen.add(entry.id);
    if (entry.direction === "transfer" && !entry.counterparty_account_id) {
      errors.push(`${entry.id}: transfer requires counterparty_account_id`);
    }
  }

  if (errors.length) {
    console.error("✗ payment-calendar:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`✓ payment-calendar — ${calendar.data.entries.length} entries (${calendar.path})`);
}

function appendCalendarEntries(entries: PaymentCalendarEntry[]): number {
  if (entries.length === 0) return 0;
  const path = resolveFinanceFilePath("payment-calendar.yaml");
  let file: { entries: PaymentCalendarEntry[]; currency?: string };
  if (existsSync(path)) {
    file = paymentCalendarFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
  } else {
    file = { currency: "JPY", entries: [] };
  }
  const ids = new Set(file.entries.map((e) => e.id));
  let added = 0;
  for (const entry of entries) {
    if (ids.has(entry.id)) continue;
    file.entries.push(entry);
    ids.add(entry.id);
    added++;
  }
  file.entries.sort((a, b) => a.date.localeCompare(b.date));
  writeYamlFile(path, file);
  return added;
}

export function runJpBankCalendarImport(opts: {
  from: CalendarImportSource;
  fy?: string;
  month?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const result = buildCalendarImport({
    from: opts.from,
    fy: opts.fy,
    month: opts.month,
  });
  const proposed = result.entries;

  if (opts.json) {
    console.log(JSON.stringify({ from: opts.from, proposed, warnings: result.warnings }, null, 2));
    return;
  }

  if (!opts.write) {
    console.log(`# calendar import (${opts.from}) — dry-run\n`);
    for (const p of proposed) {
      console.log(`- ${p.date} ${p.category} ${formatCurrency(p.amount)} (${p.id})`);
    }
    for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
    console.log("\n--write で payment-calendar.yaml に追記");
    return;
  }

  const added = appendCalendarEntries(proposed);
  console.log(`✓ calendar import (${opts.from}) — ${added} entries added`);
  for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
}

export function runJpBankArApList(opts: { kind?: "ar" | "ap"; json?: boolean }): void {
  const ledger = loadArApLedger();
  if (!ledger) {
    console.error("ar-ap-ledger.yaml missing");
    process.exit(1);
  }

  let entries = ledger.data.entries;
  if (opts.kind) entries = entries.filter((e) => e.kind === opts.kind);

  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`# 売掛・買掛台帳（${entries.length}）\n`);
  console.log("| ID | 種別 | 相手 | 金額 | 計上 | 期日 | 状態 |");
  console.log("|----|------|------|-----:|------|------|------|");
  for (const e of entries) {
    console.log(
      `| ${e.id} | ${e.kind} | ${e.counterparty} | ${formatCurrency(e.amount)} | ${e.booked_date} | ${e.due_date} | ${e.status} |`
    );
  }
}

export function runJpBankArApValidate(): void {
  const errors: string[] = [];
  const ledger = loadArApLedger();
  const terms = loadCollectionTerms();

  if (!ledger) {
    console.error("ar-ap-ledger.yaml missing");
    process.exit(1);
  }

  const seen = new Set<string>();
  for (const entry of ledger.data.entries) {
    if (seen.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
    seen.add(entry.id);
    if (entry.due_date < entry.booked_date) {
      errors.push(`${entry.id}: due_date before booked_date`);
    }
  }
  errors.push(
    ...validateCollectionTermReferences(
      ledger.data.entries,
      terms?.data.rules ?? []
    )
  );

  if (terms) {
    for (const rule of terms.data.rules) {
      if (!rule.id || !rule.label) errors.push(`collection term ${rule.id} invalid`);
    }
  }

  if (errors.length) {
    console.error("✗ ar-ap-ledger:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const open = ledger.data.entries.filter((e) => e.status === "open" || e.status === "partial");
  console.log(`✓ ar-ap-ledger — ${ledger.data.entries.length} entries · ${open.length} open (${ledger.path})`);
}

export function runJpBankArApSync(opts: {
  from?: string;
  fy?: string;
  month?: string;
  write?: boolean;
  json?: boolean;
}): void {
  if (opts.from !== "invoices") {
    console.error("Only --from invoices is supported");
    process.exit(1);
  }
  const result = buildInvoiceArApEntries({ fy: opts.fy, month: opts.month });

  if (opts.json) {
    console.log(JSON.stringify({ synced: result.entries, warnings: result.warnings }, null, 2));
    return;
  }

  if (!opts.write) {
    console.log("# ar-ap sync (invoices) — dry-run\n");
    for (const e of result.entries) {
      console.log(`- ${e.id} ${e.kind} ${formatCurrency(e.amount)} due ${e.due_date}`);
    }
    for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
    return;
  }

  const path = resolveFinanceFilePath("ar-ap-ledger.yaml");
  let file = existsSync(path)
    ? arApLedgerFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")))
    : { currency: "JPY" as const, entries: [] };
  const merged = mergeArApEntries(file, result.entries);
  if (merged.added > 0) {
    writeYamlFile(path, merged.ledger);
  }
  console.log(`✓ ar-ap sync — ${merged.added} entries added`);
  for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
}

export function runJpBankCashflowExport(opts: { template?: string; write?: boolean; json?: boolean }): void {
  const template = opts.template ?? "cash-book-csv";
  const result = generateCashflowExport(template);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          template,
          template_path: repoRelativePath(result.template_path),
          rows: result.row_count,
          warnings: result.warnings,
        },
        null,
        2
      )
    );
    return;
  }

  if (opts.write) {
    const basename =
      template === "cash-book-csv"
        ? `cash-book-${currentDate()}.csv`
        : `${template}-${currentDate()}.csv`;
    const outPath = join(getDocsDir(), "exports", basename);
    writeTrackedFile(outPath, result.csv);
    console.log(`✓ cashflow export → ${outPath}`);
    for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
    return;
  }

  console.log(result.csv);
  for (const warning of result.warnings) console.warn(`⚠ ${warning}`);
}

export function runJpBankTreasurySkill(opts: { write?: boolean; output?: string }): void {
  runJpBankCashflowGenerate({
    granularity: "weekly",
    horizon: "13w",
    write: opts.write,
  });
  if (opts.write && opts.output) {
    const schedule = buildCashflowSchedule({ granularity: "weekly", horizon: "13w" });
    writeMarkdownReport(
      "agent-summaries/treasury",
      opts.output,
      formatCashflowMarkdown(schedule).split("\n").slice(0, 40).join("\n")
    );
  }
}

export function runJpBankPositionSkill(opts: { json?: boolean }): void {
  runJpBankPositionShow({ json: opts.json });
}

/** L1 summary for Steward Chat Today context */
export function getCashflowTodaySummary(): {
  schedule_path?: string;
  shortfall_date?: string | null;
  runway_days?: number | null;
  required_funding_amount?: number | null;
  required_funding_by_date?: string | null;
} {
  const dir = join(getDocsDir(), "finance", "treasury", "cashflow-schedule");
  if (!existsSync(dir)) return {};
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") || f.endsWith(".json"))
    .sort();
  const latestJson = files.filter((f) => f.endsWith(".json")).at(-1);
  const latestMd = files.filter((f) => f.endsWith(".md")).at(-1);
  const latest = latestJson ?? latestMd;
  if (!latest) return {};
  const absolutePath = join(dir, latest);
  const schedule_path = repoRelativePath(absolutePath);
  if (!latestJson) return { schedule_path };
  let schedule: CashflowSchedule;
  try {
    schedule = cashflowScheduleSchema.parse(
      JSON.parse(readFileSync(absolutePath, "utf-8"))
    );
  } catch {
    return { schedule_path };
  }
  return {
    schedule_path,
    shortfall_date: schedule.shortfall_date ?? null,
    runway_days: schedule.runway_days ?? null,
    required_funding_amount: schedule.required_funding_amount ?? null,
    required_funding_by_date: schedule.required_funding_by_date ?? null,
  };
}
