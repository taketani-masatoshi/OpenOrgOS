import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  fixedTermHistoryFileSchema,
  laborContractSourcesFileSchema,
  laborContractsFileSchema,
  minimumWagesFileSchema,
  type FixedTermHistoryPeriod,
  type LaborContract,
  type MinimumWagesFile,
} from "../../../../../../schemas/jp-labor-contract.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir, loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import {
  assessEmployeeConversion,
  collectFixedTermPeriods,
  evaluateContract,
  type ContractCheckResult,
  type EmployeeConversionAssessment,
} from "./assessment.js";
import { jurisdictionCheck, STATUS_MARKS, type CheckItem } from "./checks.js";
import {
  conversionRightArisesWithin,
  normalizePeriods,
  type NonRenewalNotice,
} from "./conversion.js";
import { buildDraftVars, missingRequiredItems, renderTemplate } from "./draft.js";
import { JP_PREFECTURES } from "./minimum-wage.js";

export const MODULE_ID = "jp_labor_contract";

const CONTRACTS_FILE = "labor-contracts.yaml";
const HISTORY_FILE = "fixed-term-history.yaml";
const MINIMUM_WAGES_FILE = "minimum-wages.yaml";
const SOURCES_FILE = "sources.yaml";
const NOTICE_FORM_ID = "form-rodo-joken-tsuchisho";
const DEFAULT_NOTICE_TEMPLATE = "templates/rodo-joken-tsuchisho.md.example";
const NOTICE_OUTPUT_NAME = "rodo-joken-tsuchisho.md";
const FALLBACK_DOCS_ROOT = "docs/company/hr/labor-contracts";

export {
  evaluateContract,
  assessEmployeeConversion,
  collectFixedTermPeriods,
} from "./assessment.js";
export { summarizeStatus, jurisdictionCheck } from "./checks.js";
export {
  conversionRightArisesWithin,
  coolingThresholdMonths,
  currentSegment,
  exceedsConversionThreshold,
  isCoolingGap,
  normalizePeriods,
  sumPeriodLengths,
  assessNonRenewalNotice,
} from "./conversion.js";
export { addMonths, addYears, periodLength } from "./dates.js";
export { assessDisclosures, requiredDisclosures } from "./disclosures.js";
export { assessMinimumWage, findMinimumWage, toHourlyWage } from "./minimum-wage.js";
export {
  assessFixedTermLength,
  assessProbation,
  assessRenewalCapExplanation,
  exceedsYears,
} from "./terms.js";

function loadLaborDataFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { data: z.output<S>; path: string } | null {
  return loadModuleDataFile(MODULE_ID, filename, schema);
}

function loadContracts(): LaborContract[] | null {
  return loadLaborDataFile(CONTRACTS_FILE, laborContractsFileSchema)?.data.contracts ?? null;
}

function loadHistory(): FixedTermHistoryPeriod[] {
  return loadLaborDataFile(HISTORY_FILE, fixedTermHistoryFileSchema)?.data.periods ?? [];
}

function loadMinimumWages(): MinimumWagesFile | null {
  return loadLaborDataFile(MINIMUM_WAGES_FILE, minimumWagesFileSchema)?.data ?? null;
}

function loadSources() {
  return loadLaborDataFile(SOURCES_FILE, laborContractSourcesFileSchema)?.data ?? null;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function resolveTemplatePath(templateRel: string): string | null {
  const bare = templateRel.replace(/\.example$/, "");
  const candidates = [
    join(getModuleDataDir(MODULE_ID), bare),
    join(getModuleDataDir(MODULE_ID), `${bare}.example`),
    join(getModuleSeedDir(MODULE_ID), `${bare}.example`),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function resolveDocsRoot(): string {
  const bound = loadEnabledModulesSafe().find((mod) => mod.agent === MODULE_ID)?.docs_root;
  const rel = bound ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? FALLBACK_DOCS_ROOT;
  return join(getDocsDir(), rel.replace(/^docs\//, "").replace(/\/$/, ""));
}

function findContract(contracts: readonly LaborContract[], contractId: string): LaborContract {
  const contract = contracts.find((candidate) => candidate.id === contractId);
  if (!contract) fail(`Contract ${contractId} not found in ${CONTRACTS_FILE}`);
  return contract;
}

interface ContractListing {
  id: string;
  employee_id: string;
  contract_type: LaborContract["contract_type"];
  part_time: boolean;
  start_date: string;
  end_date: string | null;
  workplace_prefecture: string;
}

interface ShowSummary {
  jurisdiction: string;
  contracts: number;
  fixed_term_contracts: number;
  employees: number;
  history_periods: number;
  minimum_wage_rates: number;
  minimum_wage_verified_through: string | null;
  official_sources: number;
  contracts_list: ContractListing[];
}

export function runJpLaborContractShow(opts: { json?: boolean }): void {
  const contracts = loadContracts() ?? [];
  const minimumWages = loadMinimumWages();
  const sources = loadSources();
  const summary: ShowSummary = {
    jurisdiction: getResolvedJurisdiction().code,
    contracts: contracts.length,
    fixed_term_contracts: contracts.filter((contract) => contract.contract_type === "fixed_term")
      .length,
    employees: new Set(contracts.map((contract) => contract.employee_id)).size,
    history_periods: loadHistory().length,
    minimum_wage_rates: minimumWages?.rates.length ?? 0,
    minimum_wage_verified_through: minimumWages?.verified_through ?? null,
    official_sources: sources?.sources.length ?? 0,
    contracts_list: contracts.map(
      ({
        id,
        employee_id,
        contract_type,
        part_time,
        start_date,
        end_date,
        workplace_prefecture,
      }) => ({
        id,
        employee_id,
        contract_type,
        part_time,
        start_date,
        end_date: end_date ?? null,
        workplace_prefecture,
      })
    ),
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  printShow(summary, sources?.sources ?? []);
}

function printShow(
  summary: ShowSummary,
  sources: ReadonlyArray<{ title: string; url: string }>
): void {
  console.log(`# ${MODULE_ID}\n`);
  console.log(
    `法域: ${summary.jurisdiction} · 契約 ${summary.contracts} · 従業員 ${summary.employees}`
  );
  console.log(`最低賃金表の確認期限: ${summary.minimum_wage_verified_through ?? "未設定"}\n`);
  if (sources.length) {
    console.log("## 公表資料\n");
    for (const source of sources) console.log(`- **${source.title}** — ${source.url}`);
    console.log("");
  }
  console.log("## 契約\n");
  for (const contract of summary.contracts_list) {
    const period = `${contract.start_date}〜${contract.end_date ?? ""}`;
    console.log(
      `- \`${contract.id}\` · ${contract.employee_id} · ${contract.contract_type} · ${period} · ${contract.workplace_prefecture}`
    );
  }
}

function validateContractRecord(contract: LaborContract): string[] {
  const errors: string[] = [];
  const prefix = contract.id;
  if (contract.contract_type === "fixed_term" && !contract.end_date)
    errors.push(`${prefix}: fixed_term requires end_date`);
  if (contract.contract_type === "indefinite" && contract.end_date)
    errors.push(`${prefix}: indefinite must not set end_date`);
  if (contract.end_date && contract.end_date < contract.start_date)
    errors.push(`${prefix}: end_date before start_date`);
  if (!JP_PREFECTURES.includes(contract.workplace_prefecture)) {
    errors.push(`${prefix}: unknown workplace_prefecture ${contract.workplace_prefecture}`);
  }
  const hoursByUnit: Partial<Record<LaborContract["wage"]["unit"], number | undefined>> = {
    daily: contract.wage.daily_scheduled_hours,
    weekly: contract.wage.weekly_scheduled_hours,
    monthly: contract.wage.monthly_average_scheduled_hours,
  };
  if (contract.wage.unit in hoursByUnit && !hoursByUnit[contract.wage.unit]) {
    errors.push(`${prefix}: wage.unit ${contract.wage.unit} requires scheduled hours`);
  }
  return errors;
}

function validateDuplicates(ids: readonly string[], label: string): string[] {
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return [...new Set(duplicates)].map((id) => `duplicate ${label}: ${id}`);
}

function validatePeriodOverlaps(
  contracts: readonly LaborContract[],
  history: readonly FixedTermHistoryPeriod[]
): string[] {
  const employees = new Set([
    ...contracts.map((c) => c.employee_id),
    ...history.map((p) => p.employee_id),
  ]);
  const invalidHistory = history
    .filter((period) => period.end_date < period.start_date)
    .map(
      (period) => `history ${period.employee_id} ${period.start_date}: end_date before start_date`
    );
  const overlaps = [...employees]
    .filter(
      (employeeId) =>
        normalizePeriods(collectFixedTermPeriods(employeeId, contracts, history)).overlap
    )
    .map((employeeId) => `${employeeId}: overlapping fixed-term periods`);
  return [...invalidHistory, ...overlaps];
}

function validateMinimumWageTable(table: MinimumWagesFile): string[] {
  const unknown = table.rates
    .filter((rate) => !JP_PREFECTURES.includes(rate.prefecture))
    .map((rate) => `minimum-wages: unknown prefecture ${rate.prefecture}`);
  const keys = table.rates.map((rate) => `${rate.prefecture}@${rate.effective_from}`);
  return [...unknown, ...validateDuplicates(keys, "minimum wage rate")];
}

function validateTemplates(forms: ReadonlyArray<{ id: string; template: string }>): string[] {
  return forms
    .filter((form) => !resolveTemplatePath(form.template))
    .map((form) => `form ${form.id}: template missing (${form.template})`);
}

/** Integrity issues in already-parsed module data (no file access). */
export function findLaborDataIssues(input: {
  contracts: readonly LaborContract[];
  history: readonly FixedTermHistoryPeriod[];
  minimumWages: MinimumWagesFile | null;
}): string[] {
  return [
    ...validateDuplicates(
      input.contracts.map((contract) => contract.id),
      "contract id"
    ),
    ...input.contracts.flatMap(validateContractRecord),
    ...validatePeriodOverlaps(input.contracts, input.history),
    ...(input.minimumWages ? validateMinimumWageTable(input.minimumWages) : []),
  ];
}

export function collectValidationErrors(): string[] {
  const jp = jurisdictionCheck(getResolvedJurisdiction().code);
  const jurisdictionErrors = jp.status === "ok" ? [] : [`req-jp: ${jp.detail}`];
  const contracts = loadContracts();
  const minimumWages = loadMinimumWages();
  const sources = loadSources();
  const missing = [
    contracts ? null : `${CONTRACTS_FILE} missing`,
    minimumWages ? null : `${MINIMUM_WAGES_FILE} missing`,
    sources ? null : `${SOURCES_FILE} missing`,
  ].filter((message): message is string => message !== null);
  return [
    ...jurisdictionErrors,
    ...missing,
    ...findLaborDataIssues({ contracts: contracts ?? [], history: loadHistory(), minimumWages }),
    ...validateTemplates(sources?.forms ?? []),
  ];
}

export function runJpLaborContractValidate(): void {
  const errors = collectValidationErrors();
  if (errors.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — labor contract data OK`);
}

function requireContractData(): {
  contracts: LaborContract[];
  history: FixedTermHistoryPeriod[];
  minimumWages: MinimumWagesFile;
} {
  const contracts = loadContracts();
  const minimumWages = loadMinimumWages();
  if (!contracts) fail(`${CONTRACTS_FILE} missing`);
  if (!minimumWages) fail(`${MINIMUM_WAGES_FILE} missing`);
  return { contracts, history: loadHistory(), minimumWages };
}

export function buildContractCheck(contractId: string, asOf: string): ContractCheckResult {
  const { contracts, history, minimumWages } = requireContractData();
  const contract = findContract(contracts, contractId);
  return evaluateContract(contract, {
    asOf,
    jurisdictionCode: getResolvedJurisdiction().code,
    minimumWages,
    employeePeriods: collectFixedTermPeriods(contract.employee_id, contracts, history),
  });
}

export function runJpLaborContractCheck(opts: {
  contract: string;
  asOf?: string;
  json?: boolean;
}): void {
  const result = buildContractCheck(opts.contract, opts.asOf ?? currentDate());
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`# Check — ${result.contract_id}（${result.employee_id}）\n`);
  for (const check of result.checks) printCheck(check);
  console.log(`\n判定: ${result.status} · 準備支援のみ — 法令適合の最終判断は人間（社労士等）`);
}

function printCheck(check: CheckItem): void {
  console.log(`${STATUS_MARKS[check.status]} ${check.label} — ${check.detail} [${check.basis}]`);
}

function currentContractFor(
  employeeId: string,
  contracts: readonly LaborContract[],
  asOf: string
): LaborContract | null {
  const active = contracts.filter(
    (contract) =>
      contract.employee_id === employeeId &&
      contract.contract_type === "fixed_term" &&
      contract.start_date <= asOf &&
      (contract.end_date ?? asOf) >= asOf
  );
  return active[active.length - 1] ?? null;
}

export interface ConversionReport {
  as_of: string;
  jurisdiction_check: CheckItem;
  passed: boolean;
  employees: EmployeeConversionAssessment[];
}

export function buildConversionReport(asOf: string): ConversionReport {
  const { contracts, history } = requireContractData();
  const fixedTermEmployees = new Set([
    ...contracts
      .filter((contract) => contract.contract_type === "fixed_term")
      .map((contract) => contract.employee_id),
    ...history.map((period) => period.employee_id),
  ]);
  const employees = [...fixedTermEmployees].sort().map((employeeId) =>
    assessEmployeeConversion({
      employeeId,
      periods: collectFixedTermPeriods(employeeId, contracts, history),
      asOf,
      currentContract: currentContractFor(employeeId, contracts, asOf),
    })
  );
  const jurisdiction = jurisdictionCheck(getResolvedJurisdiction().code);
  const passed =
    jurisdiction.status === "ok" &&
    employees.every((employee) => employee.status !== "needs_review");
  return { as_of: asOf, jurisdiction_check: jurisdiction, passed, employees };
}

export function runJpLaborContractConversionCheck(opts: { asOf?: string; json?: boolean }): void {
  const report = buildConversionReport(opts.asOf ?? currentDate());
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`# 無期転換・雇止め予告チェック（基準日 ${report.as_of}）\n`);
  printCheck(report.jurisdiction_check);
  for (const employee of report.employees) printEmployeeConversion(employee);
  console.log("\n準備支援のみ — 無期転換・雇止めの最終判断は人間");
}

function printEmployeeConversion(employee: EmployeeConversionAssessment): void {
  const current = employee.current_contract;
  console.log(`\n## ${employee.employee_id} — ${employee.status}`);
  if (!current) {
    console.log("- 基準日に有効な有期契約なし");
    return;
  }
  console.log(
    `- 現契約 ${current.start_date}〜${current.end_date} · 通算 ${employee.cumulative_label}（起算 ${employee.segment_start}）`
  );
  console.log(
    `- 申込権: 現在 ${employee.conversion_right_now ? "あり" : "なし"} · 次回更新 ${employee.conversion_right_at_next_renewal ? "発生" : "なし"}`
  );
  if (employee.non_renewal_notice)
    console.log(`- 雇止め予告: ${describeNotice(employee.non_renewal_notice)}`);
  for (const alert of employee.alerts) console.log(`  ! ${alert}`);
  for (const reason of employee.review_reasons) console.log(`  ? ${reason}`);
}

function describeNotice(notice: NonRenewalNotice): string {
  if (notice.required === null) return `要確認 — ${notice.reason}`;
  if (!notice.required) return `不要 — ${notice.reason}`;
  return `要（期限 ${notice.deadline}）— ${notice.reason}`;
}

function loadNoticeTemplate(): string {
  const form = loadSources()?.forms.find((candidate) => candidate.id === NOTICE_FORM_ID);
  const path = resolveTemplatePath(form?.template ?? DEFAULT_NOTICE_TEMPLATE);
  if (!path) fail(`Template not found: ${form?.template ?? DEFAULT_NOTICE_TEMPLATE}`);
  return readFileSync(path, "utf-8");
}

export interface DraftResult {
  contract_id: string;
  employee_id: string;
  written: boolean;
  output: string;
  missing_items: string[];
  content: string;
}

function conversionRightForContract(
  contract: LaborContract,
  contracts: readonly LaborContract[],
  history: readonly FixedTermHistoryPeriod[]
): boolean | null {
  if (contract.contract_type !== "fixed_term" || !contract.end_date) return false;
  const period = {
    contract_id: contract.id,
    start_date: contract.start_date,
    end_date: contract.end_date,
  };
  return conversionRightArisesWithin(
    collectFixedTermPeriods(contract.employee_id, contracts, history),
    period
  );
}

export function buildDraft(contractId: string, write: boolean): DraftResult {
  const { contracts, history } = requireContractData();
  const contract = findContract(contracts, contractId);
  const draftInput = {
    contract,
    companyName: loadCompany().name,
    generatedOn: currentDate(),
    conversionRightArises: conversionRightForContract(contract, contracts, history),
  };
  const content = renderTemplate(loadNoticeTemplate(), buildDraftVars(draftInput));
  const target = join(resolveDocsRoot(), contract.id, NOTICE_OUTPUT_NAME);
  const output = write ? writeTrackedFile(target, content) : target;
  return {
    contract_id: contract.id,
    employee_id: contract.employee_id,
    written: write,
    output,
    missing_items: missingRequiredItems(draftInput),
    content,
  };
}

export function runJpLaborContractDraft(opts: {
  contract: string;
  write?: boolean;
  json?: boolean;
}): void {
  const draft = buildDraft(opts.contract, opts.write ?? false);
  if (opts.json) {
    const meta = {
      contract_id: draft.contract_id,
      employee_id: draft.employee_id,
      written: draft.written,
      output: draft.output,
      missing_items: draft.missing_items,
    };
    console.log(JSON.stringify(meta, null, 2));
    return;
  }
  if (draft.written) {
    console.log(`✓ wrote ${draft.output}`);
  } else {
    console.log(draft.content);
    console.log("\n---");
    console.log(`\`--write\` で ${draft.output} に保存`);
  }
  if (draft.missing_items.length) console.log(`要記載: ${draft.missing_items.join(", ")}`);
}
