import { ZodError, type z } from "zod";
import {
  foreignWorkersFileSchema,
  statusCatalogFileSchema,
  visaSourcesFileSchema,
  weeklyHoursFileSchema,
  type VisaSourcesFile,
} from "../../../../../../schemas/jp-visa-employment.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate } from "../../../../../../src/lib/utils.js";
import {
  CHECK_STATUS_MARKS,
  allPassing,
  countStatuses,
  jurisdictionCheck,
  type CheckCounts,
  type CheckItem,
} from "./check-item.js";
import { isIsoDate } from "./dates.js";
import {
  assessEmploymentNotices,
  assessPeriodExpiry,
  assessSelfNotificationReminders,
} from "./deadlines.js";
import { buildWorkerContext, evaluateWorker, isEmployedOn } from "./eligibility.js";
import { ILLEGAL_EMPLOYMENT_ADVISORIES, MODULE_ID } from "./statutory.js";
import { collectValidationIssues, type ForeignWorkerDataset } from "./validation.js";

export { MODULE_ID } from "./statutory.js";

export const DATA_FILES = {
  workers: "foreign-workers.yaml",
  weeks: "weekly-hours.yaml",
  catalog: "status-catalog.yaml",
  sources: "sources.yaml",
} as const;

type DataOrigin = "tenant" | "seed";

type LoadResult<T> = { ok: true; data: T; origin: DataOrigin } | { ok: false; error: string };

interface LoadedModuleData {
  dataset: ForeignWorkerDataset | null;
  sources: VisaSourcesFile | null;
  origins: Record<keyof typeof DATA_FILES, DataOrigin | undefined>;
  errors: string[];
}

export interface ForeignWorkerReport<T extends CheckItem = CheckItem> {
  module_id: string;
  report: "check" | "expiry" | "notifications";
  as_of: string;
  jurisdiction: string;
  passed: boolean;
  counts: CheckCounts;
  items: T[];
  advisories: readonly string[];
}

function formatLoadError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

function loadDataFile<S extends z.ZodTypeAny>(filename: string, schema: S): LoadResult<z.output<S>> {
  try {
    const loaded = loadModuleDataFile(MODULE_ID, filename, schema);
    if (!loaded) return { ok: false, error: `${filename} missing` };
    const origin: DataOrigin = loaded.path.startsWith(getModuleSeedDir(MODULE_ID)) ? "seed" : "tenant";
    return { ok: true, data: loaded.data, origin };
  } catch (error) {
    return { ok: false, error: `${filename}: ${formatLoadError(error)}` };
  }
}

function originOf<T>(result: LoadResult<T>): DataOrigin | undefined {
  return result.ok ? result.origin : undefined;
}

function loadModuleData(): LoadedModuleData {
  const workers = loadDataFile(DATA_FILES.workers, foreignWorkersFileSchema);
  const weeks = loadDataFile(DATA_FILES.weeks, weeklyHoursFileSchema);
  const catalog = loadDataFile(DATA_FILES.catalog, statusCatalogFileSchema);
  const sources = loadDataFile(DATA_FILES.sources, visaSourcesFileSchema);
  const errors = [workers, weeks, catalog, sources].flatMap((result) => (result.ok ? [] : [result.error]));
  const dataset =
    workers.ok && weeks.ok && catalog.ok
      ? { workers: workers.data, weeks: weeks.data, catalog: catalog.data }
      : null;
  return {
    dataset,
    sources: sources.ok ? sources.data : null,
    origins: {
      workers: originOf(workers),
      weeks: originOf(weeks),
      catalog: originOf(catalog),
      sources: originOf(sources),
    },
    errors,
  };
}

function exitWithErrors(errors: readonly string[]): never {
  console.error(`✗ ${MODULE_ID}:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

function requireDataset(): ForeignWorkerDataset {
  const loaded = loadModuleData();
  if (!loaded.dataset) exitWithErrors(loaded.errors);
  return loaded.dataset;
}

/** CLI boundary: `--as-of` defaults to today; domain functions always receive an explicit date. */
export function resolveAsOf(asOf: string | undefined): string {
  const resolved = asOf ?? currentDate();
  if (!isIsoDate(resolved)) exitWithErrors([`--as-of must be YYYY-MM-DD (got ${resolved})`]);
  return resolved;
}

function buildReport<T extends CheckItem>(
  report: ForeignWorkerReport["report"],
  asOf: string,
  jurisdictionCode: string,
  items: readonly T[]
): ForeignWorkerReport<CheckItem | T> {
  const allItems: Array<CheckItem | T> = [jurisdictionCheck(jurisdictionCode), ...items];
  return {
    module_id: MODULE_ID,
    report,
    as_of: asOf,
    jurisdiction: jurisdictionCode,
    passed: allPassing(allItems),
    counts: countStatuses(allItems),
    items: allItems,
    advisories: ILLEGAL_EMPLOYMENT_ADVISORIES,
  };
}

export function buildCheckReport(dataset: ForeignWorkerDataset, asOf: string, jurisdictionCode: string) {
  const items = dataset.workers.workers
    .filter((worker) => isEmployedOn(worker, asOf))
    .flatMap((worker) => evaluateWorker(buildWorkerContext(worker, dataset.catalog), dataset.weeks.weeks, asOf));
  return buildReport("check", asOf, jurisdictionCode, items);
}

export function buildExpiryReport(dataset: ForeignWorkerDataset, asOf: string, jurisdictionCode: string) {
  const items = dataset.workers.workers
    .filter((worker) => isEmployedOn(worker, asOf))
    .map((worker) => assessPeriodExpiry(worker, asOf));
  return buildReport("expiry", asOf, jurisdictionCode, items);
}

export function buildNotificationsReport(dataset: ForeignWorkerDataset, asOf: string, jurisdictionCode: string) {
  const items = dataset.workers.workers.flatMap((worker) => [
    ...assessEmploymentNotices(worker, asOf),
    ...assessSelfNotificationReminders(worker, asOf),
  ]);
  return buildReport("notifications", asOf, jurisdictionCode, items);
}

const REPORT_TITLES: Record<ForeignWorkerReport["report"], string> = {
  check: "就労可否 · 資格外活動時間 · 在留カード確認",
  expiry: "在留期間満了アラート",
  notifications: "外国人雇用状況届出（ハローワーク）· 本人届出リマインダ",
};

function printReport(report: ForeignWorkerReport): void {
  console.log(`# ${MODULE_ID} — ${REPORT_TITLES[report.report]}（as of ${report.as_of}）\n`);
  for (const item of report.items) {
    const who = item.employee_id ? `${item.employee_id} ` : "";
    console.log(`${CHECK_STATUS_MARKS[item.status]} [${item.status}] ${who}${item.label} — ${item.detail}（${item.legal_basis}）`);
  }
  const { ok, notice, alert, needs_review } = report.counts;
  console.log(`\n集計: ok ${ok} · notice ${notice} · alert ${alert} · needs_review ${needs_review}`);
  console.log(report.passed ? "PASS（記録上）" : "要対応あり — alert / needs_review を人間が確認");
  console.log("\n## 注意\n");
  for (const advisory of report.advisories) console.log(`- ${advisory}`);
}

function emitReport(report: ForeignWorkerReport, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report);
}

type ReportBuilder = (dataset: ForeignWorkerDataset, asOf: string, jurisdictionCode: string) => ForeignWorkerReport;

function runReport(builder: ReportBuilder, opts: { asOf?: string; json?: boolean }): void {
  const asOf = resolveAsOf(opts.asOf);
  const dataset = requireDataset();
  emitReport(builder(dataset, asOf, getResolvedJurisdiction().code), opts.json);
}

export function runForeignWorkersCheck(opts: { asOf?: string; json?: boolean }): void {
  runReport(buildCheckReport, opts);
}

export function runForeignWorkersExpiry(opts: { asOf?: string; json?: boolean }): void {
  runReport(buildExpiryReport, opts);
}

export function runForeignWorkersNotifications(opts: { asOf?: string; json?: boolean }): void {
  runReport(buildNotificationsReport, opts);
}

export function runForeignWorkersValidate(): void {
  const loaded = loadModuleData();
  const jp = jurisdictionCheck(getResolvedJurisdiction().code);
  const jurisdictionIssues = jp.status === "ok" ? [] : [`req-jp: ${jp.detail}`];
  const dataIssues = loaded.dataset ? [...loaded.errors, ...collectValidationIssues(loaded.dataset)] : loaded.errors;
  const issues = [...jurisdictionIssues, ...dataIssues];
  if (issues.length > 0) exitWithErrors(issues);
  console.log(`✓ ${MODULE_ID} — foreign worker data OK`);
}

function countByStatus(dataset: ForeignWorkerDataset): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const worker of dataset.workers.workers) {
    counts[worker.status_of_residence] = (counts[worker.status_of_residence] ?? 0) + 1;
  }
  return counts;
}

function buildShowSummary(loaded: LoadedModuleData & { dataset: ForeignWorkerDataset }, jurisdictionCode: string) {
  const { dataset, sources } = loaded;
  return {
    module_id: MODULE_ID,
    jurisdiction: jurisdictionCode,
    data_origin: loaded.origins,
    workers: dataset.workers.workers.length,
    separated_workers: dataset.workers.workers.filter((worker) => worker.separated_on !== undefined).length,
    workers_by_status: countByStatus(dataset),
    weekly_hour_records: dataset.weeks.weeks.length,
    catalog_statuses: dataset.catalog.statuses.length,
    job_categories: dataset.catalog.job_categories.length,
    official_sources: sources?.sources.length ?? 0,
    sources: sources?.sources.map((source) => ({ id: source.id, title: source.title, url: source.url })) ?? [],
  };
}

export function runForeignWorkersShow(opts: { json?: boolean }): void {
  const loaded = loadModuleData();
  if (!loaded.dataset) exitWithErrors(loaded.errors);
  const summary = buildShowSummary({ ...loaded, dataset: loaded.dataset }, getResolvedJurisdiction().code);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ${MODULE_ID}\n`);
  console.log(`法域: ${summary.jurisdiction} · 外国人労働者 ${summary.workers}（うち離職 ${summary.separated_workers}）· 週次記録 ${summary.weekly_hour_records}`);
  console.log(`データ: ${JSON.stringify(summary.data_origin)}（seed = 架空サンプル）\n`);
  console.log("## 在留資格別\n");
  for (const [code, count] of Object.entries(summary.workers_by_status)) console.log(`- \`${code}\` × ${count}`);
  console.log("\n## 公表資料\n");
  for (const source of summary.sources) console.log(`- **${source.title}** — ${source.url}`);
}
