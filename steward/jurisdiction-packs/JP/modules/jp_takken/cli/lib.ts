import { join } from "node:path";
import type { z } from "zod";
import { brokerageDealsFileSchema } from "../../../../../../schemas/business-modules.js";
import {
  takkenLicenseFileSchema,
  takkenOfficesFileSchema,
  takkenSettingsFileSchema,
  takkenSourcesFileSchema,
  takkenTransactionKind,
  takkenTransactionRole,
  takkenTaxStatus,
  takkenTransactionsFileSchema,
  type TakkenTaxStatus,
} from "../../../../../../schemas/jp-takken.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { jurisdictionCheck, type TakkenCheckItem } from "./check-item.js";
import { findTakkenDataIssues } from "./data-issues.js";
import { computeFeeLimit, type FeeLimit } from "./fee.js";
import { evaluateLicenseChecks, renewalWindow } from "./license-rules.js";
import { evaluateOfficeChecks } from "./office-rules.js";
import { buildReport, formatCheckLine, formatCounts, HUMAN_DECISION_NOTICE, printReport, type TakkenReport } from "./report.js";
import { evaluateStaffingChecks } from "./staffing-rules.js";
import { evaluateTransaction, type TransactionCheckResult } from "./transaction-rules.js";

export * from "./check-item.js";
export * from "./dates.js";
export * from "./data-issues.js";
export * from "./fee.js";
export * from "./license-rules.js";
export * from "./office-rules.js";
export * from "./report.js";
export * from "./staffing-rules.js";
export * from "./transaction-rules.js";

export const MODULE_ID = "jp_takken";
const BROKERAGE_MODULE_ID = "real_estate_brokerage";
const FALLBACK_DOCS_ROOT = "docs/takken";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function loadTakkenFile<S extends z.ZodTypeAny>(filename: string, schema: S): { data: z.output<S>; path: string } | null {
  const loaded = loadModuleDataFile(MODULE_ID, filename, schema);
  if (!loaded) return null;
  return { data: schema.parse(loaded.data), path: loaded.path };
}

function loadLicense() {
  return loadTakkenFile("license.yaml", takkenLicenseFileSchema);
}

function loadOffices() {
  return loadTakkenFile("offices.yaml", takkenOfficesFileSchema);
}

function loadTransactions() {
  return loadTakkenFile("transactions.yaml", takkenTransactionsFileSchema);
}

function loadSettings() {
  return loadTakkenFile("settings.yaml", takkenSettingsFileSchema);
}

function loadSources() {
  return loadTakkenFile("sources.yaml", takkenSourcesFileSchema);
}

/** real_estate_brokerage の deals.yaml は読取専用（価格は持たないため報酬計算は transactions.yaml の金額を使う） */
function loadKnownDealIds(): ReadonlySet<string> | null {
  const deals = loadModuleDataFile(BROKERAGE_MODULE_ID, "deals.yaml", brokerageDealsFileSchema);
  return deals ? new Set(deals.data.deals.map((deal) => deal.id)) : null;
}

function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}

export function resolveAsOf(asOf: string | undefined): string {
  if (asOf === undefined) return currentDate();
  if (!ISO_DATE_PATTERN.test(asOf)) exitWithError(`--as-of must be YYYY-MM-DD (got ${asOf})`);
  return asOf;
}

function requireData<T>(loaded: { data: T } | null, filename: string): T {
  if (!loaded) exitWithError(`${MODULE_ID}: ${filename} not found (tenant data or seed)`);
  return loaded.data;
}

function jurisdictionCode(): string {
  return getResolvedJurisdiction().code;
}

function emitReport(title: string, report: TakkenReport, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(title, report);
}

export function runJpTakkenShow(opts: { json?: boolean }): void {
  const license = loadLicense();
  const offices = loadOffices();
  const transactions = loadTransactions();
  const settings = loadSettings();
  const sources = loadSources();
  const summary = {
    module: MODULE_ID,
    jurisdiction: jurisdictionCode(),
    entity: license?.data.entity ?? null,
    license: license
      ? { ...license.data.license, renewal_window: renewalWindow(license.data.license.expires_on) }
      : null,
    tax_status: settings?.data.settings.tax_status ?? null,
    offices: (offices?.data.offices ?? []).map((office) => ({
      office_id: office.office_id,
      name: office.name,
      kind: office.kind,
      prefecture: office.prefecture,
      staff_count: office.staff_count,
      takkenshi: office.takkenshi.length,
      dedicated: office.takkenshi.filter((t) => t.dedicated).length,
    })),
    transactions: transactions?.data.transactions.length ?? 0,
    official_sources: sources?.data.sources.length ?? 0,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  printShowSummary(summary, sources?.data.sources ?? []);
}

function printShowSummary(
  summary: {
    jurisdiction: string;
    entity: string | null;
    license: { license_number: string; expires_on: string; renewal_window: { opens_on: string; closes_on: string } } | null;
    tax_status: string | null;
    offices: Array<{ office_id: string; name: string; kind: string; staff_count: number; dedicated: number }>;
    transactions: number;
  },
  sources: ReadonlyArray<{ title: string; url: string }>
): void {
  console.log(`# ${MODULE_ID}\n`);
  console.log(`法域: ${summary.jurisdiction} · ${summary.entity ?? "—"} · 消費税: ${summary.tax_status ?? "—"}`);
  if (summary.license) {
    const window = summary.license.renewal_window;
    console.log(`免許: ${summary.license.license_number} · 満了 ${summary.license.expires_on} · 更新申請 ${window.opens_on}〜${window.closes_on}`);
  }
  console.log(`取引: ${summary.transactions} 件\n`);
  console.log("## 事務所\n");
  for (const office of summary.offices) {
    console.log(`- \`${office.office_id}\` ${office.name} (${office.kind}) · 従業者 ${office.staff_count} · 専任 ${office.dedicated}`);
  }
  if (sources.length === 0) return;
  console.log("\n## 公表資料\n");
  for (const source of sources) console.log(`- **${source.title}** — ${source.url}`);
}

export function runJpTakkenValidate(): void {
  const license = loadLicense();
  const offices = loadOffices();
  const transactions = loadTransactions();
  const issues = findTakkenDataIssues(
    {
      license: license?.data ?? null,
      offices: offices?.data.offices ?? null,
      transactions: transactions?.data.transactions ?? null,
      hasSettings: loadSettings() !== null,
      hasSources: loadSources() !== null,
    },
    jurisdictionCode()
  );
  if (issues.length > 0) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — takken data OK`);
}

export function buildLicenseReport(asOf: string): TakkenReport {
  const license = requireData(loadLicense(), "license.yaml");
  const offices = requireData(loadOffices(), "offices.yaml").offices;
  const code = jurisdictionCode();
  const checks = [
    jurisdictionCheck(code),
    ...evaluateLicenseChecks({ license: license.license, changes: license.changes, security: license.security, offices, asOf }),
  ];
  return buildReport({ module: MODULE_ID, report: "license", asOf, jurisdiction: code, checks });
}

export function runJpTakkenLicense(opts: { asOf?: string; json?: boolean }): void {
  emitReport(`${MODULE_ID} — 免許・変更届出・営業保証金`, buildLicenseReport(resolveAsOf(opts.asOf)), opts.json);
}

export function buildStaffingReport(asOf: string): TakkenReport {
  const offices = requireData(loadOffices(), "offices.yaml").offices;
  const code = jurisdictionCode();
  const checks = [jurisdictionCheck(code), ...evaluateStaffingChecks(offices, asOf)];
  return buildReport({ module: MODULE_ID, report: "staffing", asOf, jurisdiction: code, checks });
}

export function runJpTakkenStaffing(opts: { asOf?: string; json?: boolean }): void {
  emitReport(`${MODULE_ID} — 専任の宅建士・宅建士証`, buildStaffingReport(resolveAsOf(opts.asOf)), opts.json);
}

export interface TakkenComplianceReport extends TakkenReport {
  transactions: TransactionCheckResult[];
}

export function buildComplianceReport(asOf: string): TakkenComplianceReport {
  const offices = requireData(loadOffices(), "offices.yaml").offices;
  const transactions = requireData(loadTransactions(), "transactions.yaml").transactions;
  const settings = requireData(loadSettings(), "settings.yaml").settings;
  const code = jurisdictionCode();
  const ctx = { offices, taxStatus: settings.tax_status, knownDealIds: loadKnownDealIds(), asOf };
  const results = transactions.map((tx) => evaluateTransaction(tx, ctx));
  const transactionChecks: TakkenCheckItem[] = results.flatMap((result) =>
    result.checks.map((check) => ({ ...check, id: `${result.transaction_id}:${check.id}` }))
  );
  const checks = [jurisdictionCheck(code), ...evaluateOfficeChecks(offices, settings), ...transactionChecks];
  return {
    ...buildReport({ module: MODULE_ID, report: "check", asOf, jurisdiction: code, checks }),
    transactions: results,
  };
}

function resolveDocsRootRel(): string {
  const bound = loadEnabledModulesSafe().find((mod) => mod.agent === MODULE_ID)?.docs_root;
  return (bound ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? FALLBACK_DOCS_ROOT).replace(/\/$/, "");
}

export function renderComplianceMarkdown(report: TakkenComplianceReport): string {
  const lines = [
    `# 宅建業 コンプライアンス点検（as of ${report.as_of}）`,
    "",
    `- module: \`${report.module}\` · 法域: ${report.jurisdiction}`,
    `- 結果: **${report.status}** · ${formatCounts(report.counts)}`,
    "",
    "## 点検結果",
    "",
    ...report.checks.map((check) => `- ${formatCheckLine(check)}`),
    "",
    HUMAN_DECISION_NOTICE,
    "",
  ];
  return lines.join("\n");
}

export function runJpTakkenCheck(opts: { asOf?: string; json?: boolean; write?: boolean }): void {
  const report = buildComplianceReport(resolveAsOf(opts.asOf));
  const relPath = `${resolveDocsRootRel()}/compliance-check-${report.as_of}.md`;
  const writtenPath = opts.write
    ? writeTrackedFile(join(getDocsDir(), relPath.replace(/^docs\//, "")), renderComplianceMarkdown(report))
    : null;
  if (opts.json) {
    console.log(JSON.stringify({ ...report, written: writtenPath }, null, 2));
    return;
  }
  printReport(`${MODULE_ID} — 取引・事務所の点検`, report);
  console.log(writtenPath ? `\n✓ wrote ${writtenPath}` : `\n\`--write\` で ${relPath} に保存`);
}

export interface FeeCliOptions {
  kind: string;
  price: string;
  role?: string;
  lowCostVacant?: boolean;
  residential?: boolean;
  taxStatus?: string;
  json?: boolean;
}

function parseEnumOption<T extends string>(schema: z.ZodType<T>, value: string, flag: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) exitWithError(`${flag}: invalid value "${value}"`);
  return parsed.data;
}

function parseYen(value: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) exitWithError(`--price must be a non-negative integer yen (got ${value})`);
  return amount;
}

function resolveTaxStatus(override: string | undefined): TakkenTaxStatus {
  if (override !== undefined) return parseEnumOption(takkenTaxStatus, override, "--tax-status");
  return loadSettings()?.data.settings.tax_status ?? "taxable";
}

export function runJpTakkenFee(opts: FeeCliOptions): void {
  const limit = computeFeeLimit({
    kind: parseEnumOption(takkenTransactionKind, opts.kind, "--kind"),
    role: parseEnumOption(takkenTransactionRole, opts.role ?? "brokerage", "--role"),
    basisYen: parseYen(opts.price),
    taxStatus: resolveTaxStatus(opts.taxStatus),
    residential: opts.residential ?? false,
    lowCostVacantSpecial: opts.lowCostVacant ?? false,
  });
  const jurisdiction = jurisdictionCheck(jurisdictionCode());
  if (opts.json) {
    console.log(JSON.stringify({ module: MODULE_ID, checks: [jurisdiction], ...limit }, null, 2));
    return;
  }
  printFeeLimit(limit, jurisdiction);
}

const KIND_LABELS: Record<FeeLimit["kind"], string> = { sale: "売買", exchange: "交換", lease: "貸借" };
const ROLE_LABELS: Record<FeeLimit["role"], string> = { brokerage: "媒介", agency: "代理" };
const TAX_LABELS: Record<TakkenTaxStatus, string> = { taxable: "課税事業者（税込）", exempt: "免税事業者" };

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")} 円`;
}

function printFeeLimit(limit: FeeLimit, jurisdiction: TakkenCheckItem): void {
  console.log(`# 報酬上限 — ${KIND_LABELS[limit.kind]} · ${ROLE_LABELS[limit.role]} · ${TAX_LABELS[limit.tax_status]}\n`);
  console.log(formatCheckLine(jurisdiction));
  console.log(`基準: ${limit.basis_label} ${formatYen(limit.basis_yen)}`);
  for (const line of limit.brackets) {
    const range = `${formatYen(line.from_yen)}〜${line.to_yen === null ? "" : formatYen(line.to_yen)}`;
    console.log(`  ${range} · ${formatYen(line.segment_yen)} × ${line.rate_percent}% = ${line.amount_excl_tax_yen.toLocaleString("ja-JP")} 円`);
  }
  console.log(`通常計算（税抜）: ${formatYen(limit.standard_excl_tax_yen)}${limit.special_applied ? " · 低廉な空家等の特例を適用" : ""}`);
  const perClientLabel = limit.residential_one_party_cap_yen === null ? "依頼者の一方" : "依頼者の一方 · 承諾あり";
  console.log(`上限（${perClientLabel}）: ${formatYen(limit.per_client_cap_yen)}`);
  if (limit.combined_cap_yen !== null) console.log(`上限（双方・相手方との合計）: ${formatYen(limit.combined_cap_yen)}`);
  if (limit.residential_one_party_cap_yen !== null) {
    console.log(`上限（居住用 · 承諾なしの一方）: ${formatYen(limit.residential_one_party_cap_yen)}`);
  }
  for (const note of limit.notes) console.log(`- ${note}`);
  console.log(`\n根拠: ${limit.basis_articles.join(" · ")} · 1円未満切捨て`);
  console.log(HUMAN_DECISION_NOTICE);
}
