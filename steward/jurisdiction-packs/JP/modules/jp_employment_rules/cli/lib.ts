import { join } from "node:path";
import type {
  EmploymentRulesSources,
  OvertimeAgreement,
  OvertimeRecord,
  WorkRulesRecord,
  Workplace,
} from "../../../../../../schemas/jp-employment-rules.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, resolveTenantPath, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { evaluateAgreement, hasSuccessorAgreement } from "./agreement-rules.js";
import {
  MODULE_ID,
  loadAgreements,
  loadOvertimeRecords,
  loadSources,
  loadTemplate,
  loadWorkRules,
  loadWorkplaces,
  resolveTemplatePath,
  sourceUrl,
} from "./data.js";
import {
  buildAgreementDraftVars,
  buildWorkRulesDraftVars,
  renderTemplate,
  type DraftKind,
  type DraftSourceUrls,
} from "./draft.js";
import {
  buildAgreementReport,
  buildOvertimeReport,
  buildWorkRulesReport,
  formatReport,
  type CheckReport,
} from "./reports.js";
import { evaluateWorkplaceWorkRules } from "./work-rules-rules.js";

export { MODULE_ID } from "./data.js";
export * from "./legal-limits.js";
export * from "./work-rules-rules.js";
export * from "./agreement-rules.js";
export * from "./overtime-rules.js";
export * from "./reports.js";
export { agreementFormLabel, findingsBlock, renderTemplate } from "./draft.js";

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function printReport(report: CheckReport, title: string, json?: boolean): void {
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report, title));
}

function jurisdictionCode(): string {
  return getResolvedJurisdiction().code;
}

export function runJpWorkRulesShow(opts: { json?: boolean }): void {
  const workplaces = loadWorkplaces()?.workplaces ?? [];
  const summary = {
    jurisdiction: jurisdictionCode(),
    workplaces: workplaces.length,
    work_rules: loadWorkRules()?.work_rules.length ?? 0,
    agreements: loadAgreements()?.agreements.length ?? 0,
    overtime_employees: loadOvertimeRecords()?.records.length ?? 0,
    official_sources: loadSources()?.sources.length ?? 0,
    workplaces_list: workplaces.map((w) => ({ id: w.id, name: w.name, regular_headcount: w.regular_headcount ?? null })),
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ${MODULE_ID}\n`);
  console.log(`法域: ${summary.jurisdiction} · 事業場 ${summary.workplaces} · 就業規則 ${summary.work_rules} · 36協定 ${summary.agreements}\n`);
  for (const w of summary.workplaces_list) {
    console.log(`- \`${w.id}\` ${w.name} · 常時 ${w.regular_headcount == null ? "人数未登録" : `${w.regular_headcount}人`}`);
  }
  for (const s of loadSources()?.sources ?? []) console.log(`- **${s.title}** — ${s.url}`);
}

function duplicates(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function referenceIssues(
  workplaces: readonly Workplace[],
  workRules: readonly WorkRulesRecord[],
  agreements: readonly OvertimeAgreement[],
  records: readonly OvertimeRecord[]
): string[] {
  const workplaceIds = new Set(workplaces.map((w) => w.id));
  const agreementIds = new Set(agreements.map((a) => a.id));
  return [
    ...duplicates(workplaces.map((w) => w.id)).map((id) => `duplicate workplace id ${id}`),
    ...duplicates(workRules.map((r) => r.workplace_id)).map((id) => `duplicate work_rules for ${id}`),
    ...duplicates(agreements.map((a) => a.id)).map((id) => `duplicate agreement id ${id}`),
    ...workRules.filter((r) => !workplaceIds.has(r.workplace_id)).map((r) => `work_rules: unknown workplace_id ${r.workplace_id}`),
    ...agreements.filter((a) => !workplaceIds.has(a.workplace_id)).map((a) => `${a.id}: unknown workplace_id ${a.workplace_id}`),
    ...agreements.filter((a) => a.effective_from > a.effective_to).map((a) => `${a.id}: effective_from after effective_to`),
    ...records.filter((r) => !agreementIds.has(r.agreement_id)).map((r) => `${r.employee_id}: unknown agreement_id ${r.agreement_id}`),
    ...records.flatMap((r) => duplicates(r.months.map((m) => m.month)).map((m) => `${r.employee_id}: duplicate month ${m}`)),
  ];
}

function templateIssues(sources: EmploymentRulesSources): string[] {
  return sources.forms.filter((f) => !resolveTemplatePath(f.template)).map((f) => `form ${f.id}: template missing (${f.template})`);
}

export function collectValidationIssues(): string[] {
  const workplaces = loadWorkplaces();
  const workRules = loadWorkRules();
  const agreements = loadAgreements();
  const records = loadOvertimeRecords();
  const sources = loadSources();
  const missing = [
    workplaces ? null : "workplaces.yaml missing",
    workRules ? null : "work-rules.yaml missing",
    agreements ? null : "agreements.yaml missing",
    records ? null : "overtime-records.yaml missing",
    sources ? null : "sources.yaml missing",
  ].filter((m): m is string => m !== null);
  if (!workplaces || !workRules || !agreements || !records || !sources) return missing;
  return [
    ...referenceIssues(workplaces.workplaces, workRules.work_rules, agreements.agreements, records.records),
    ...templateIssues(sources),
  ];
}

export function runJpWorkRulesValidate(): void {
  const issues = collectValidationIssues();
  if (issues.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — work rules and Article 36 agreement data OK`);
}

export function runJpWorkRulesCheck(opts: { json?: boolean }): void {
  const report = buildWorkRulesReport({
    asOf: currentDate(),
    jurisdictionCode: jurisdictionCode(),
    workplaces: loadWorkplaces()?.workplaces ?? [],
    workRules: loadWorkRules()?.work_rules ?? [],
  });
  printReport(report, "就業規則 点検（事業場単位）", opts.json);
}

function exitOnInvalid(value: string, pattern: RegExp, label: string): void {
  if (pattern.test(value)) return;
  console.error(`${label} must match ${pattern.source}: ${value}`);
  process.exit(1);
}

export function runJpAgreementCheck(opts: { asOf?: string; json?: boolean }): void {
  const asOf = opts.asOf ?? currentDate();
  exitOnInvalid(asOf, ISO_DATE_PATTERN, "--as-of");
  const report = buildAgreementReport({
    asOf,
    jurisdictionCode: jurisdictionCode(),
    agreements: loadAgreements()?.agreements ?? [],
  });
  printReport(report, "36協定 点検", opts.json);
}

export function runJpOvertimeCheck(opts: { month: string; json?: boolean }): void {
  exitOnInvalid(opts.month, YEAR_MONTH_PATTERN, "--month");
  const report = buildOvertimeReport({
    targetMonth: opts.month,
    jurisdictionCode: jurisdictionCode(),
    agreements: loadAgreements()?.agreements ?? [],
    records: loadOvertimeRecords()?.records ?? [],
  });
  printReport(report, "時間外・休日労働 実績点検", opts.json);
}

function draftSourceUrls(): DraftSourceUrls {
  return {
    law: sourceUrl("egov-labor-standards-act", "https://laws.e-gov.go.jp/law/322AC0000000049"),
    modelWorkRules: sourceUrl(
      "mhlw-model-work-rules",
      "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/zigyonushi/model/index.html"
    ),
    forms: sourceUrl(
      "mhlw-forms",
      "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/roudoukijunkankei.html"
    ),
  };
}

function templateFor(kind: DraftKind): string {
  const form = loadSources()?.forms.find((f) => f.kind === kind);
  return form?.template ?? (kind === "work-rules" ? "templates/work-rules.md.example" : "templates/36-agreement.md.example");
}

export function resolveDocsRoot(): string {
  const bound = loadEnabledModulesSafe().find((m) => m.agent === MODULE_ID)?.docs_root;
  const rel = (bound ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? "docs/company/hr/work-rules").replace(/\/$/, "");
  return resolveTenantPath(rel);
}

interface DraftOutput {
  kind: DraftKind;
  subject_id: string;
  file_name: string;
  content: string;
}

function workRulesDraft(workplaceId: string | undefined, generatedOn: string): DraftOutput | null {
  const workplaces = loadWorkplaces()?.workplaces ?? [];
  const workplace = workplaceId ? workplaces.find((w) => w.id === workplaceId) : workplaces[0];
  if (!workplace) return null;
  const rules = loadWorkRules()?.work_rules.find((r) => r.workplace_id === workplace.id);
  const vars = buildWorkRulesDraftVars({
    companyName: loadCompany().name,
    workplace,
    rules,
    checks: evaluateWorkplaceWorkRules(workplace, rules),
    generatedOn,
    urls: draftSourceUrls(),
  });
  const content = renderTemplate(loadTemplate(templateFor("work-rules")), vars);
  return { kind: "work-rules", subject_id: workplace.id, file_name: `work-rules-${workplace.id}.md`, content };
}

function agreementDraft(agreementId: string | undefined, generatedOn: string): DraftOutput | null {
  const agreements = loadAgreements()?.agreements ?? [];
  const agreement = agreementId ? agreements.find((a) => a.id === agreementId) : agreements[0];
  if (!agreement) return null;
  const workplace = loadWorkplaces()?.workplaces.find((w) => w.id === agreement.workplace_id);
  const vars = buildAgreementDraftVars({
    companyName: loadCompany().name,
    workplace,
    agreement,
    checks: evaluateAgreement(agreement, generatedOn, hasSuccessorAgreement(agreement, agreements)),
    generatedOn,
    urls: draftSourceUrls(),
  });
  const content = renderTemplate(loadTemplate(templateFor("agreement")), vars);
  return { kind: "agreement", subject_id: agreement.id, file_name: `36-agreement-${agreement.id}.md`, content };
}

export function runJpWorkRulesDraft(opts: {
  kind?: string;
  workplace?: string;
  agreement?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const kind = opts.kind ?? "work-rules";
  if (kind !== "work-rules" && kind !== "agreement") {
    console.error(`--kind must be work-rules or agreement: ${kind}`);
    process.exit(1);
  }
  const generatedOn = currentDate();
  const draft = kind === "work-rules" ? workRulesDraft(opts.workplace, generatedOn) : agreementDraft(opts.agreement, generatedOn);
  if (!draft) {
    console.error(`${kind}: target not found (${opts.workplace ?? opts.agreement ?? "no records"})`);
    process.exit(1);
  }
  const path = opts.write ? writeTrackedFile(join(resolveDocsRoot(), draft.file_name), draft.content) : null;
  if (opts.json) {
    console.log(JSON.stringify({ kind: draft.kind, subject_id: draft.subject_id, written: Boolean(path), path, content: draft.content }, null, 2));
    return;
  }
  if (path) {
    console.log(`✓ wrote ${path}`);
    return;
  }
  console.log(draft.content);
  console.log("\n---\n`--write` で docs/company/hr/work-rules/ に保存（人間レビュー前提 · 自動届出なし）");
}
