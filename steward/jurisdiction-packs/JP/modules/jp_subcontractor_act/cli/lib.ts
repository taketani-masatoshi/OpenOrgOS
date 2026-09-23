import { join } from "node:path";
import type { z } from "zod";
import {
  subcontractPartiesFileSchema,
  subcontractSettingsFileSchema,
  subcontractSourcesFileSchema,
  subcontractTransactionsFileSchema,
  type SubcontractParty,
  type SubcontractPrincipal,
  type SubcontractTransaction,
} from "../../../../../../schemas/jp-subcontractor-act.js";
import { loadProcurementVendors } from "../../../../../../src/lib/extension-sot.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir, loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import {
  computeLatePaymentInterest,
  computeReductionInterest,
  deemedPaymentDueDate,
  evaluateTransactionChecks,
  LATE_INTEREST_DAYS_PER_YEAR,
  netAmountYen,
  resolveSettlementDate,
  summarizeOutcome,
  TORITEKI_EFFECTIVE_DATE,
  unjustifiedReductions,
  type CheckStatus,
  type InterestPeriod,
  type SubcontractCheckItem,
  type TransactionOutcome,
} from "./rules.js";
import { determineScope, type ScopeResult } from "./scope.js";

export * from "./rules.js";
export * from "./scope.js";

export const MODULE_ID = "jp_subcontractor_act";
export const LAW_NAME =
  "製造委託等に係る中小受託事業者に対する代金の支払の遅延等の防止に関する法律（中小受託取引適正化法 · 取適法）";
const DISCLAIMER =
  "準備・点検支援のみ — 法令適合を保証しない。最終判断・行政対応は人間（法務 · 顧問弁護士）が行う。";
const REQUIRED_JURISDICTION = "JP";
const SETTINGS_FILE = "settings.yaml";
const PARTIES_FILE = "subcontract-parties.yaml";
const TRANSACTIONS_FILE = "transactions.yaml";
const SOURCES_FILE = "sources.yaml";
const FALLBACK_DOCS_ROOT = "docs/procurement/subcontract/";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: "✓",
  fail: "✗",
  needs_review: "?",
  not_applicable: "–",
  not_assessed: "·",
};

interface LoadedFile<T> {
  data: T;
  path: string;
}

interface CoreData {
  principal: SubcontractPrincipal;
  parties: SubcontractParty[];
  transactions: SubcontractTransaction[];
}

export interface ScopeEntry extends ScopeResult {
  transaction_id: string;
  vendor_id: string;
  category: SubcontractTransaction["category"];
  ordered_on: string;
  supplier_facts_as_of?: string;
}

export type TransactionCheckOutcome = TransactionOutcome | "not_covered";

export interface TransactionCheck {
  transaction_id: string;
  vendor_id: string;
  scope_status: ScopeResult["status"];
  scope_reasons: string[];
  outcome: TransactionCheckOutcome;
  items: SubcontractCheckItem[];
}

export interface CheckReport {
  as_of: string;
  jurisdiction: string;
  law: string;
  checks: SubcontractCheckItem[];
  outcome: TransactionOutcome;
  summary: Record<TransactionCheckOutcome, number>;
  transactions: TransactionCheck[];
  disclaimer: string;
}

function loadSubcontractFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): LoadedFile<z.output<S>> | null {
  return loadModuleDataFile(MODULE_ID, filename, schema);
}

export function jurisdictionItem(code: string): SubcontractCheckItem {
  const ok = code === REQUIRED_JURISDICTION;
  return {
    id: "req-jp",
    label: "日本法域テナントであること",
    article: "取適法（日本法）",
    status: ok ? "pass" : "fail",
    detail: ok ? REQUIRED_JURISDICTION : `current: ${code}`,
  };
}

function loadCoreData(): CoreData {
  const settings = loadSubcontractFile(SETTINGS_FILE, subcontractSettingsFileSchema);
  const parties = loadSubcontractFile(PARTIES_FILE, subcontractPartiesFileSchema);
  const transactions = loadSubcontractFile(TRANSACTIONS_FILE, subcontractTransactionsFileSchema);
  if (!settings || !parties || !transactions) {
    console.error(
      `✗ ${MODULE_ID}: ${SETTINGS_FILE} · ${PARTIES_FILE} · ${TRANSACTIONS_FILE} が必要`
    );
    process.exit(1);
  }
  return {
    principal: settings.data.principal,
    parties: parties.data.parties,
    transactions: transactions.data.transactions,
  };
}

function resolveAsOf(asOf?: string): string {
  if (!asOf) return currentDate();
  if (!ISO_DATE_PATTERN.test(asOf)) {
    console.error(`--as-of must be YYYY-MM-DD (got ${asOf})`);
    process.exit(1);
  }
  return asOf;
}

function findTransaction(
  transactions: SubcontractTransaction[],
  id: string
): SubcontractTransaction {
  const found = transactions.find((tx) => tx.id === id);
  if (!found) {
    console.error(`Transaction ${id} not found in ${TRANSACTIONS_FILE}`);
    process.exit(1);
  }
  return found;
}

export function buildScopeEntry(
  tx: SubcontractTransaction,
  principal: SubcontractPrincipal,
  parties: SubcontractParty[]
): ScopeEntry {
  const supplier = parties.find((party) => party.vendor_id === tx.vendor_id);
  const scope = determineScope({
    category: tx.category,
    ordered_on: tx.ordered_on,
    principal,
    supplier,
  });
  return {
    transaction_id: tx.id,
    vendor_id: tx.vendor_id,
    category: tx.category,
    ordered_on: tx.ordered_on,
    supplier_facts_as_of: supplier?.as_of,
    ...scope,
  };
}

function scopeReviewItem(scope: ScopeEntry): SubcontractCheckItem {
  return {
    id: "scope",
    label: "適用対象（取引類型 × 資本金・従業員基準）",
    article: scope.article ?? "法第2条第8項・第9項",
    status: "needs_review",
    detail: scope.reasons.join(" / "),
  };
}

export function buildTransactionCheck(
  tx: SubcontractTransaction,
  scope: ScopeEntry,
  asOf: string
): TransactionCheck {
  const base = {
    transaction_id: tx.id,
    vendor_id: tx.vendor_id,
    scope_status: scope.status,
    scope_reasons: scope.reasons,
  };
  if (scope.status === "not_covered") return { ...base, outcome: "not_covered", items: [] };
  const checks = evaluateTransactionChecks(tx, asOf);
  const needsScopeItem =
    scope.status === "needs_review" && !checks.some((c) => c.id === "legacy-order");
  const items = needsScopeItem ? [scopeReviewItem(scope), ...checks] : checks;
  return { ...base, outcome: summarizeOutcome(items), items };
}

function emptySummary(): Record<TransactionCheckOutcome, number> {
  return { fail: 0, needs_review: 0, no_issue_detected: 0, not_covered: 0 };
}

export function buildCheckReport(data: CoreData, jurisdiction: string, asOf: string): CheckReport {
  const req = jurisdictionItem(jurisdiction);
  const transactions =
    req.status === "pass"
      ? data.transactions.map((tx) =>
          buildTransactionCheck(tx, buildScopeEntry(tx, data.principal, data.parties), asOf)
        )
      : [];
  const summary = emptySummary();
  for (const tx of transactions) summary[tx.outcome] += 1;
  const outcome: TransactionOutcome =
    req.status === "fail" ? "fail" : summarizeOutcome(transactions.flatMap((tx) => tx.items));
  return {
    as_of: asOf,
    jurisdiction,
    law: LAW_NAME,
    checks: [req],
    outcome,
    summary,
    transactions,
    disclaimer: DISCLAIMER,
  };
}

export function runSubcontractShow(opts: { json?: boolean }): void {
  const settings = loadSubcontractFile(SETTINGS_FILE, subcontractSettingsFileSchema);
  const parties = loadSubcontractFile(PARTIES_FILE, subcontractPartiesFileSchema);
  const transactions = loadSubcontractFile(TRANSACTIONS_FILE, subcontractTransactionsFileSchema);
  const sources = loadSubcontractFile(SOURCES_FILE, subcontractSourcesFileSchema);
  const summary = {
    jurisdiction: getResolvedJurisdiction().code,
    law: LAW_NAME,
    effective_date: TORITEKI_EFFECTIVE_DATE,
    principal: settings?.data.principal ?? null,
    parties: parties?.data.parties.length ?? 0,
    transactions: transactions?.data.transactions.length ?? 0,
    official_sources: sources?.data.sources.length ?? 0,
    transactions_list: transactions?.data.transactions ?? [],
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  printShow(summary, sources?.data.sources ?? []);
}

function printShow(
  summary: {
    jurisdiction: string;
    parties: number;
    transactions: number;
    transactions_list: SubcontractTransaction[];
  },
  sources: Array<{ title: string; url: string }>
): void {
  console.log(`# ${MODULE_ID}\n`);
  console.log(`${LAW_NAME} · 施行 ${TORITEKI_EFFECTIVE_DATE}`);
  console.log(
    `法域: ${summary.jurisdiction} · 受託先 ${summary.parties} · 取引 ${summary.transactions}\n`
  );
  if (sources.length) {
    console.log("## 公表資料\n");
    for (const source of sources) console.log(`- **${source.title}** — ${source.url}`);
    console.log("");
  }
  console.log("## 取引\n");
  for (const tx of summary.transactions_list) {
    console.log(`- \`${tx.id}\` · ${tx.vendor_id} · ${tx.category} · 発注 ${tx.ordered_on}`);
  }
}

function tryLoad<S extends z.ZodTypeAny>(
  filename: string,
  schema: S,
  errors: string[]
): LoadedFile<z.output<S>> | null {
  try {
    const loaded = loadSubcontractFile(filename, schema);
    if (!loaded) errors.push(`${filename} missing`);
    return loaded;
  } catch (error) {
    errors.push(`${filename}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function findDuplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export function collectTransactionIssues(
  transactions: SubcontractTransaction[],
  parties: SubcontractParty[]
): string[] {
  const issues = findDuplicates(transactions.map((tx) => tx.id)).map(
    (id) => `duplicate transaction id ${id}`
  );
  issues.push(
    ...findDuplicates(parties.map((p) => p.vendor_id)).map(
      (id) => `duplicate party vendor_id ${id}`
    )
  );
  const partyIds = new Set(parties.map((party) => party.vendor_id));
  for (const tx of transactions) {
    if (!partyIds.has(tx.vendor_id))
      issues.push(`${tx.id}: vendor_id ${tx.vendor_id} has no subcontract-parties entry`);
    if (tx.received_on && tx.received_on < tx.ordered_on)
      issues.push(`${tx.id}: received_on before ordered_on`);
    if (tx.paid_on && tx.paid_on < tx.ordered_on)
      issues.push(`${tx.id}: paid_on before ordered_on`);
  }
  return issues;
}

/** vendors.yaml（procurement SoT）との参照整合 — seed 利用時は警告のみ */
function collectVendorMasterIssues(
  transactions: SubcontractTransaction[],
  usingSeed: boolean
): { errors: string[]; warnings: string[] } {
  const vendors = loadProcurementVendors();
  if (!vendors)
    return { errors: [], warnings: ["data/procurement/vendors.yaml なし — vendor_id 照合を省略"] };
  const known = new Set(vendors.vendors.map((vendor) => vendor.id));
  const missing = [...new Set(transactions.map((tx) => tx.vendor_id))].filter(
    (id) => !known.has(id)
  );
  const messages = missing.map((id) => `vendor_id ${id} not in data/procurement/vendors.yaml`);
  return usingSeed ? { errors: [], warnings: messages } : { errors: messages, warnings: [] };
}

export function runSubcontractValidate(): void {
  const errors: string[] = [];
  const settings = tryLoad(SETTINGS_FILE, subcontractSettingsFileSchema, errors);
  const parties = tryLoad(PARTIES_FILE, subcontractPartiesFileSchema, errors);
  const transactions = tryLoad(TRANSACTIONS_FILE, subcontractTransactionsFileSchema, errors);
  tryLoad(SOURCES_FILE, subcontractSourcesFileSchema, errors);
  const warnings: string[] = [];
  if (settings && parties && transactions) {
    errors.push(...collectTransactionIssues(transactions.data.transactions, parties.data.parties));
    const usingSeed = transactions.path.startsWith(getModuleSeedDir(MODULE_ID));
    const master = collectVendorMasterIssues(transactions.data.transactions, usingSeed);
    errors.push(...master.errors);
    warnings.push(...master.warnings);
  }
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (errors.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — subcontract data OK`);
}

export function runSubcontractScope(opts: { transaction?: string; json?: boolean }): void {
  const data = loadCoreData();
  const jurisdiction = getResolvedJurisdiction().code;
  const req = jurisdictionItem(jurisdiction);
  const targets = opts.transaction
    ? [findTransaction(data.transactions, opts.transaction)]
    : data.transactions;
  const entries =
    req.status === "pass"
      ? targets.map((tx) => buildScopeEntry(tx, data.principal, data.parties))
      : [];
  const report = {
    jurisdiction,
    law: LAW_NAME,
    checks: [req],
    transactions: entries,
    disclaimer: DISCLAIMER,
  };
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`# Scope — ${MODULE_ID}\n`);
  console.log(`${STATUS_ICONS[req.status]} ${req.label} — ${req.detail}`);
  for (const entry of entries) {
    const basis = entry.basis ? ` · ${entry.basis}` : "";
    console.log(
      `- \`${entry.transaction_id}\` · ${entry.category} · **${entry.status}**${basis} — ${entry.reasons.join(" / ")}`
    );
  }
  console.log(`\n${DISCLAIMER}`);
}

function resolveDocsDir(): string {
  const mod = loadEnabledModulesSafe().find((entry) => entry.agent === MODULE_ID);
  const docsRoot = mod?.docs_root ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? FALLBACK_DOCS_ROOT;
  return join(getDocsDir(), docsRoot.replace(/^docs\//, ""));
}

export function renderCheckMarkdown(report: CheckReport): string {
  const lines = [
    `# 取適法チェック — ${report.as_of}`,
    "",
    `- 法令: ${report.law}`,
    `- 法域: ${report.jurisdiction} · 総合: **${report.outcome}**`,
    `- 集計: ${Object.entries(report.summary)
      .map(([key, count]) => `${key} ${count}`)
      .join(" · ")}`,
    "",
  ];
  for (const tx of report.transactions) {
    lines.push(`## ${tx.transaction_id}（${tx.vendor_id}）— ${tx.outcome}`, "");
    if (tx.outcome === "not_covered") lines.push(`- 適用対象外: ${tx.scope_reasons.join(" / ")}`);
    for (const entry of tx.items) {
      lines.push(
        `- ${STATUS_ICONS[entry.status]} ${entry.label}（${entry.article}）— ${entry.detail}`
      );
    }
    lines.push("");
  }
  lines.push(`> ${report.disclaimer}`, "");
  return lines.join("\n");
}

export function runSubcontractCheck(opts: {
  asOf?: string;
  json?: boolean;
  write?: boolean;
}): void {
  const asOf = resolveAsOf(opts.asOf);
  const report = buildCheckReport(loadCoreData(), getResolvedJurisdiction().code, asOf);
  const markdown = renderCheckMarkdown(report);
  const writtenPath = opts.write
    ? writeTrackedFile(join(resolveDocsDir(), `check-${asOf}.md`), markdown)
    : null;
  if (opts.json) {
    console.log(JSON.stringify({ ...report, written: writtenPath }, null, 2));
    return;
  }
  console.log(
    `${STATUS_ICONS[report.checks[0].status]} ${report.checks[0].label} — ${report.checks[0].detail}\n`
  );
  console.log(markdown);
  console.log(
    writtenPath ? `✓ wrote ${writtenPath}` : "`--write` で docs/procurement/subcontract/ に保存"
  );
}

export interface LateInterestReport {
  transaction_id: string;
  jurisdiction: string;
  checks: SubcontractCheckItem[];
  computed: boolean;
  scope_status?: ScopeResult["status"];
  received_on?: string;
  deemed_due_on?: string;
  settled_on?: string;
  provisional?: boolean;
  late_payment?: InterestPeriod;
  reductions: Array<InterestPeriod & { changed_on: string; reason: string; refunded: boolean }>;
  total_interest_yen: number;
  rate: string;
  method: string;
  review_notes: string[];
}

const INTEREST_METHOD = `年14.6% × 日数 ÷ ${LATE_INTEREST_DAYS_PER_YEAR}（閏年も同じ）· 開始日（60日経過日）と支払日の両端算入 · 円未満切捨て`;

function reductionInterests(
  tx: SubcontractTransaction,
  receivedOn: string,
  asOf: string
): LateInterestReport["reductions"] {
  return unjustifiedReductions(tx).map((change) => ({
    ...computeReductionInterest({
      receivedOn,
      reducedOn: change.changed_on,
      reducedYen: Math.abs(change.delta_yen),
      refundedOn: change.refunded_on ?? asOf,
    }),
    changed_on: change.changed_on,
    reason: change.reason,
    refunded: Boolean(change.refunded_on),
  }));
}

export function buildLateInterestReport(
  tx: SubcontractTransaction,
  scope: ScopeEntry,
  jurisdiction: string,
  asOf: string
): LateInterestReport {
  const req = jurisdictionItem(jurisdiction);
  const base = {
    transaction_id: tx.id,
    jurisdiction,
    checks: [req],
    rate: "年14.6%",
    method: INTEREST_METHOD,
  };
  const empty = { ...base, reductions: [], total_interest_yen: 0 };
  if (req.status === "fail")
    return { ...empty, computed: false, review_notes: ["JP 法域外 — 計算しない"] };
  if (!tx.received_on)
    return {
      ...empty,
      computed: false,
      scope_status: scope.status,
      review_notes: ["未受領 — 計算不可"],
    };

  const settlement = resolveSettlementDate(tx, asOf);
  const latePayment = computeLatePaymentInterest({
    receivedOn: tx.received_on,
    agreedDueOn: tx.payment_due_on,
    settledOn: settlement.settled_on,
    unpaidYen: netAmountYen(tx),
  });
  const reductions = reductionInterests(tx, tx.received_on, asOf);
  const scopeNotes =
    scope.status === "covered" ? [] : [`適用対象: ${scope.status} — ${scope.reasons.join(" / ")}`];
  return {
    ...base,
    computed: true,
    scope_status: scope.status,
    received_on: tx.received_on,
    deemed_due_on: deemedPaymentDueDate(tx.received_on, tx.payment_due_on),
    settled_on: settlement.settled_on,
    provisional: settlement.provisional,
    late_payment: latePayment,
    reductions,
    total_interest_yen:
      latePayment.interest_yen + reductions.reduce((sum, r) => sum + r.interest_yen, 0),
    review_notes: [...scopeNotes, ...settlement.review_notes],
  };
}

export function runSubcontractLateInterest(opts: {
  transaction: string;
  asOf?: string;
  json?: boolean;
}): void {
  const asOf = resolveAsOf(opts.asOf);
  const data = loadCoreData();
  const tx = findTransaction(data.transactions, opts.transaction);
  const scope = buildScopeEntry(tx, data.principal, data.parties);
  const report = buildLateInterestReport(tx, scope, getResolvedJurisdiction().code, asOf);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printLateInterest(report);
}

function printLateInterest(report: LateInterestReport): void {
  console.log(`# 遅延利息 — ${report.transaction_id}\n`);
  console.log(
    `${STATUS_ICONS[report.checks[0].status]} ${report.checks[0].label} — ${report.checks[0].detail}`
  );
  if (report.late_payment) {
    const period = report.late_payment;
    console.log(
      `支払遅延（法第6条第1項）: ${period.start_on} 〜 ${period.end_on} · ${period.days}日 · ${period.principal_yen.toLocaleString("ja-JP")} 円 → ${period.interest_yen.toLocaleString("ja-JP")} 円`
    );
  }
  for (const reduction of report.reductions) {
    console.log(
      `減額（法第6条第2項）: ${reduction.start_on} 〜 ${reduction.end_on} · ${reduction.days}日 · ${reduction.principal_yen.toLocaleString("ja-JP")} 円 → ${reduction.interest_yen.toLocaleString("ja-JP")} 円`
    );
  }
  console.log(`\n合計: ${report.total_interest_yen.toLocaleString("ja-JP")} 円 · ${report.method}`);
  for (const note of report.review_notes) console.log(`? ${note}`);
  console.log(`\n${DISCLAIMER}`);
}
