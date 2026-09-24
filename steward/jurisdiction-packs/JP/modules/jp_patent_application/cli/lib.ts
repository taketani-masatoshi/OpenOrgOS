import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  patentFieldMapFileSchema,
  patentHolidaysFileSchema,
  patentRegistryFileSchema,
  patentSourcesFileSchema,
  patentSpecificationFileSchema,
  type PatentApplication,
  type PatentFieldMapFile,
  type PatentSourcesFile,
  type PatentSpecification,
} from "../../../../../../schemas/jp-patent.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import { getModuleDataDir, loadModuleDataFile } from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir, loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { buildHolidayCalendar, type HolidayCalendar } from "./calendar.js";
import {
  buildPatentChecklist,
  jurisdictionCheck,
  summarizeChecklist,
  type ApplicantSnapshot,
  type CheckStatus,
  type PatentCheckItem,
} from "./checklist.js";
import { computeApplicationDeadlines, countDeadlinesByStatus, type PatentDeadline } from "./deadlines.js";
import { buildPatentDraftVars, renderTemplate, type DraftSourceUrls } from "./draft.js";
import { validatePatentData } from "./validation.js";

export * from "./calendar.js";
export * from "./checklist.js";
export * from "./deadlines.js";
export * from "./draft.js";
export * from "./validation.js";

export const MODULE_ID = "jp_patent_application";

const DEFAULT_DOCS_ROOT = "docs/ip/patent";
const FILING_FEE_ID = "patent-application";
const DEFAULT_SOURCE_URLS: DraftSourceUrls = {
  law: "https://laws.e-gov.go.jp/law/334AC0000000121",
  form: "https://laws.e-gov.go.jp/law/335M50000400010",
  fee: "https://www.jpo.go.jp/system/process/tesuryo/hyou.html",
};
const SOURCE_URL_IDS: Record<keyof DraftSourceUrls, string> = {
  law: "egov-patent-act",
  form: "egov-patent-rules",
  fee: "jpo-fee-table",
};
const STATUS_MARKS: Record<CheckStatus, string> = { ok: "✓", ng: "✗", needs_review: "?" };

function loadPatentDataFile<S extends z.ZodTypeAny>(filename: string, schema: S): z.output<S> | null {
  return loadModuleDataFile(MODULE_ID, filename, schema)?.data ?? null;
}

function loadApplications(): PatentApplication[] | null {
  return loadPatentDataFile("patent-registry.yaml", patentRegistryFileSchema)?.applications ?? null;
}

function loadSpecification(applicationId: string): PatentSpecification | null {
  return loadPatentDataFile(`specifications/${applicationId}.yaml`, patentSpecificationFileSchema);
}

function loadSources(): PatentSourcesFile | null {
  return loadPatentDataFile("sources.yaml", patentSourcesFileSchema);
}

function loadHolidayCalendar(): HolidayCalendar {
  return buildHolidayCalendar(loadPatentDataFile("holidays.yaml", patentHolidaysFileSchema));
}

function resolveCompanyField(source: string, company: ReturnType<typeof loadCompany>): string {
  const [root, key] = source.split(".");
  if (root !== "company" || !key) return "";
  const value: unknown = company[key as keyof typeof company];
  return typeof value === "string" ? value : "";
}

function loadApplicantSnapshot(fieldMap: PatentFieldMapFile | null): ApplicantSnapshot {
  const company = loadCompany();
  const snapshot: ApplicantSnapshot = { name: company.name, address: company.address, representative: company.representative };
  for (const mapping of fieldMap?.mappings ?? []) {
    const value = resolveCompanyField(mapping.source, company);
    if (!value) continue;
    if (mapping.form_field.includes("氏名又は名称")) snapshot.name = value;
    if (mapping.form_field.includes("住所")) snapshot.address = value;
    if (mapping.form_field.includes("代表者")) snapshot.representative = value;
  }
  return snapshot;
}

function resolveTemplatePath(templateRel: string): string | null {
  const withoutExample = templateRel.replace(/\.example$/, "");
  const candidates = [
    join(getModuleDataDir(MODULE_ID), withoutExample),
    join(getModuleDataDir(MODULE_ID), templateRel),
    join(getModuleSeedDir(MODULE_ID), templateRel),
    join(getModuleSeedDir(MODULE_ID), `${withoutExample}.example`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function resolveSourceUrls(sources: PatentSourcesFile | null): DraftSourceUrls {
  const byId = new Map(sources?.sources.map((s) => [s.id, s.url]) ?? []);
  return {
    law: byId.get(SOURCE_URL_IDS.law) ?? DEFAULT_SOURCE_URLS.law,
    form: byId.get(SOURCE_URL_IDS.form) ?? DEFAULT_SOURCE_URLS.form,
    fee: byId.get(SOURCE_URL_IDS.fee) ?? DEFAULT_SOURCE_URLS.fee,
  };
}

function resolveApplicationDocsDir(app: PatentApplication): { rel: string; abs: string } {
  const tenantModule = loadEnabledModulesSafe().find((m) => m.agent === MODULE_ID);
  const moduleRoot = (tenantModule?.docs_root ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? DEFAULT_DOCS_ROOT).replace(/\/$/, "");
  const rel = app.docs_root ?? `${moduleRoot}/${app.id}`;
  return { rel, abs: join(getDocsDir(), rel.replace(/^docs\//, "")) };
}

function findApplicationOrExit(applicationId: string): PatentApplication {
  const app = loadApplications()?.find((a) => a.id === applicationId);
  if (app) return app;
  console.error(`Application ${applicationId} not found in patent-registry.yaml`);
  process.exit(1);
}

export function currentJurisdictionCode(): string {
  return getResolvedJurisdiction().code;
}

export function runJpPatentShow(opts: { json?: boolean }): void {
  const applications = loadApplications() ?? [];
  const sources = loadSources();
  const summary = {
    jurisdiction: currentJurisdictionCode(),
    applications: applications.length,
    specifications: applications.filter((a) => loadSpecification(a.id) !== null).length,
    official_sources: sources?.sources.length ?? 0,
    forms: sources?.forms.length ?? 0,
    holiday_years: [...loadHolidayCalendar().coveredYears].sort(),
    applications_list: applications.map((a) => ({ id: a.id, title: a.title, status: a.status, filed_on: a.filed_on ?? null, planned_filing_on: a.planned_filing_on ?? null })),
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ${MODULE_ID}\n`);
  console.log(`法域: ${summary.jurisdiction} · 案件 ${summary.applications} · 明細書入力 ${summary.specifications} · 祝日データ ${summary.holiday_years.join(", ")}\n`);
  if (sources?.sources.length) {
    console.log("## 公表資料\n");
    for (const s of sources.sources) console.log(`- **${s.title}** — ${s.url}（取得 ${s.retrieved_on}）`);
    console.log("");
  }
  console.log("## 出願案件\n");
  for (const a of summary.applications_list) {
    console.log(`- \`${a.id}\` · ${a.status} · 出願 ${a.filed_on ?? `予定 ${a.planned_filing_on ?? "未定"}`} · ${a.title}`);
  }
}

export function runJpPatentValidate(): void {
  const applications = loadApplications();
  const sources = loadSources();
  const specifications = new Map(
    (applications ?? []).flatMap((a) => {
      const spec = loadSpecification(a.id);
      return spec ? [[a.id, spec] as const] : [];
    })
  );
  const issues = validatePatentData(
    {
      applications,
      specifications,
      sources,
      fieldMap: loadPatentDataFile("field-map.yaml", patentFieldMapFileSchema),
      holidays: loadPatentDataFile("holidays.yaml", patentHolidaysFileSchema),
      missingTemplates: (sources?.forms ?? []).map((f) => f.template).filter((t) => resolveTemplatePath(t) === null),
    },
    currentJurisdictionCode()
  );
  if (issues.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — patent data OK`);
}

function printDeadlines(asOf: string, check: PatentCheckItem, deadlines: readonly PatentDeadline[]): void {
  console.log(`# 特許 期限ウォッチ — as of ${asOf}\n`);
  console.log(`${STATUS_MARKS[check.status]} ${check.label} — ${check.detail}\n`);
  let current = "";
  for (const d of deadlines) {
    if (d.application_id !== current) {
      current = d.application_id;
      console.log(`\n## ${current}\n`);
    }
    const estimate = d.estimated ? "（見込み）" : "";
    const extended = d.holiday_extended ? `（法定末日 ${d.statutory_end} · 休日順延）` : "";
    console.log(`- [${d.status}] ${d.label}: ${d.date ?? "—"}${estimate}${extended} — ${d.detail} · ${d.legal_basis}`);
  }
}

export function runJpPatentDeadlines(opts: { asOf?: string; json?: boolean }): void {
  const asOf = opts.asOf ?? currentDate();
  const calendar = loadHolidayCalendar();
  const check = jurisdictionCheck(currentJurisdictionCode());
  const deadlines = (loadApplications() ?? []).flatMap((app) => computeApplicationDeadlines(app, calendar, asOf));
  const summary = countDeadlinesByStatus(deadlines);
  if (opts.json) {
    console.log(JSON.stringify({ as_of: asOf, checks: [check], summary, deadlines }, null, 2));
    return;
  }
  printDeadlines(asOf, check, deadlines);
  console.log(`\nupcoming ${summary.upcoming} · due ${summary.due} · overdue ${summary.overdue} · done ${summary.done} · needs_review ${summary.needs_review}`);
  console.log("※ 期限管理の補助。最終判断と特許庁への手続は人間（弁理士等）が行う。");
}

export function runJpPatentChecklist(opts: { application: string; asOf?: string; json?: boolean }): void {
  const app = findApplicationOrExit(opts.application);
  const asOf = opts.asOf ?? currentDate();
  const checks = buildPatentChecklist({
    app,
    specification: loadSpecification(app.id),
    applicant: loadApplicantSnapshot(loadPatentDataFile("field-map.yaml", patentFieldMapFileSchema)),
    jurisdictionCode: currentJurisdictionCode(),
    calendar: loadHolidayCalendar(),
    asOf,
  });
  const summary = summarizeChecklist(checks);
  if (opts.json) {
    console.log(JSON.stringify({ application_id: app.id, as_of: asOf, summary, checks }, null, 2));
    return;
  }
  console.log(`# 特許出願チェックリスト — ${app.id}（as of ${asOf}）\n`);
  for (const c of checks) console.log(`${STATUS_MARKS[c.status]} ${c.label} — ${c.detail} · ${c.legal_basis}`);
  console.log(`\n総合: ${summary.overall} · ng ${summary.ng} · needs_review ${summary.needs_review} · ok ${summary.ok}`);
  console.log("※ 形式面の準備支援のみ。法令適合・特許性の判断はしない。");
}

function specificationOrExit(app: PatentApplication): PatentSpecification {
  const spec = loadSpecification(app.id);
  if (spec) return spec;
  console.error(`specifications/${app.id}.yaml not found — draft requires specification inputs`);
  process.exit(1);
}

function renderDraftDocuments(app: PatentApplication, asOf: string): Array<{ name: string; content: string }> {
  const sources = loadSources();
  const vars = buildPatentDraftVars({
    app,
    specification: specificationOrExit(app),
    applicant: loadApplicantSnapshot(loadPatentDataFile("field-map.yaml", patentFieldMapFileSchema)),
    filingFeeJpy: sources?.fees.find((f) => f.id === FILING_FEE_ID)?.amount_jpy,
    generatedOn: asOf,
    sourceUrls: resolveSourceUrls(sources),
  });
  return (sources?.forms ?? []).map((form) => {
    const templatePath = resolveTemplatePath(form.template);
    if (!templatePath) throw new Error(`Template not found: ${form.template}`);
    return { name: form.output, content: renderTemplate(readFileSync(templatePath, "utf-8"), vars) };
  });
}

export function runJpPatentDraft(opts: { application: string; asOf?: string; write?: boolean; json?: boolean }): void {
  const app = findApplicationOrExit(opts.application);
  const documents = renderDraftDocuments(app, opts.asOf ?? currentDate());
  const docsDir = resolveApplicationDocsDir(app);
  const outputs = documents.map((doc) => ({
    ...doc,
    path: opts.write ? writeTrackedFile(join(docsDir.abs, doc.name), doc.content) : join(docsDir.rel, doc.name),
  }));
  const jurisdiction = currentJurisdictionCode();
  if (opts.json) {
    const files = outputs.map((o) => ({ name: o.name, path: o.path }));
    console.log(JSON.stringify({ application_id: app.id, jurisdiction, written: opts.write ?? false, outputs: files }, null, 2));
    return;
  }
  console.log(`# 特許出願書類ドラフト — ${app.id}\n`);
  if (jurisdiction !== "JP") console.log(`⚠ 法域 ${jurisdiction} — 日本の特許出願様式のため参考出力のみ\n`);
  if (opts.write) {
    for (const o of outputs) console.log(`✓ wrote ${o.path}`);
    return;
  }
  for (const o of outputs) console.log(`<!-- ${o.path} -->\n${o.content}\n`);
  console.log(`---\n\`--write\` で ${docsDir.rel}/ に保存（提出・送信は行わない）`);
}
