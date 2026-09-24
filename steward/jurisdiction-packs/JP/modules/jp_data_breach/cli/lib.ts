import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  breachHolidaysFileSchema,
  breachIncidentsFileSchema,
  breachSourcesFileSchema,
  type BreachIncident,
  type BreachReportKind,
  type BreachSourcesFile,
} from "../../../../../../schemas/jp-data-breach.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir, loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { assessIncident, type BreachAssessment } from "./assessment.js";
import {
  computeIncidentDeadlines,
  type DeadlineItem,
  type IncidentDeadlines,
} from "./deadlines.js";
import {
  buildReportItems,
  INDIVIDUAL_NOTICE_ITEM_NUMBERS,
  type ReportItem,
} from "./report-items.js";
import { validateIncidents } from "./validation.js";

export * from "./assessment.js";
export * from "./calendar.js";
export * from "./deadlines.js";
export * from "./report-items.js";
export * from "./validation.js";

export const MODULE_ID = "jp_data_breach";

const DEFAULT_DOCS_ROOT = "docs/compliance/privacy/breach";

const DEFAULT_TEMPLATES: Record<BreachReportKind, string> = {
  preliminary: "templates/report-preliminary.md.example",
  final: "templates/report-final.md.example",
};

const RECIPIENT_LABELS: Record<BreachIncident["report_recipient"], string> = {
  ppc: "個人情報保護委員会（漏えい等報告フォーム）",
  delegated_minister: "権限委任先の事業所管大臣（最新の委任先一覧を確認）",
  undetermined: "未確定 — 個人情報保護委員会 または 権限委任先省庁（needs_review）",
};

export interface JurisdictionCheck {
  id: "req-jp";
  label: string;
  ok: boolean;
  detail: string;
}

function loadBreachDataFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { data: z.output<S>; path: string } | null {
  const loaded = loadModuleDataFile(MODULE_ID, filename, schema);
  if (!loaded) return null;
  return { data: schema.parse(loaded.data), path: loaded.path };
}

function loadIncidents(): BreachIncident[] {
  return loadBreachDataFile("incidents.yaml", breachIncidentsFileSchema)?.data.incidents ?? [];
}

function loadHolidaySet(): ReadonlySet<string> {
  return new Set(
    loadBreachDataFile("holidays.yaml", breachHolidaysFileSchema)?.data.holidays ?? []
  );
}

function loadSources(): BreachSourcesFile | null {
  return loadBreachDataFile("sources.yaml", breachSourcesFileSchema)?.data ?? null;
}

export function jurisdictionCheck(): JurisdictionCheck {
  const code = getResolvedJurisdiction().code;
  return {
    id: "req-jp",
    label: "日本法域テナントであること（個人情報保護法 · 民間部門）",
    ok: code === "JP",
    detail: code === "JP" ? "JP" : `current: ${code} — 本モジュールの判定は適用外`,
  };
}

function findIncidentOrExit(incidentId: string): BreachIncident {
  const incident = loadIncidents().find((i) => i.id === incidentId);
  if (incident) return incident;
  console.error(`Incident ${incidentId} not found in incidents.yaml`);
  process.exit(1);
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

function resolveBreachDocsDir(): string {
  const tenantModule = loadEnabledModulesSafe().find((m) => m.agent === MODULE_ID);
  const docsRoot =
    tenantModule?.docs_root ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? DEFAULT_DOCS_ROOT;
  return join(getDocsDir(), docsRoot.replace(/\/$/, "").replace(/^docs\//, ""));
}

function printStatusLine(ok: boolean, text: string): void {
  console.log(`${ok ? "✓" : "✗"} ${text}`);
}

export function runJpDataBreachShow(opts: { json?: boolean }): void {
  const incidents = loadIncidents();
  const sources = loadSources();
  const assessments = incidents.map((i) => assessIncident(i));
  const summary = {
    jurisdiction: getResolvedJurisdiction().code,
    incidents: incidents.length,
    reportable: assessments.filter((a) => a.status === "reportable").length,
    needs_review: assessments.filter((a) => a.status === "needs_review").length,
    not_reportable: assessments.filter((a) => a.status === "not_reportable").length,
    official_sources: sources?.sources.length ?? 0,
    forms: sources?.forms.length ?? 0,
    incidents_list: incidents.map((i, idx) => ({
      id: i.id,
      title: i.title,
      known_on: i.known_on,
      status: i.status,
      assessment: assessments[idx].status,
    })),
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ${MODULE_ID}\n`);
  console.log(
    `法域: ${summary.jurisdiction} · 事案 ${summary.incidents} · 報告対象 ${summary.reportable} · 要確認 ${summary.needs_review}\n`
  );
  for (const s of sources?.sources ?? []) console.log(`- **${s.title}** — ${s.url}`);
  console.log("\n## 事案（incidents.yaml · L2 相当）\n");
  for (const i of summary.incidents_list) {
    console.log(`- \`${i.id}\` · 知った日 ${i.known_on} · ${i.status} · 判定 ${i.assessment}`);
  }
}

function collectValidationErrors(): string[] {
  const errors: string[] = [];
  const check = jurisdictionCheck();
  if (!check.ok) errors.push(`req-jp: ${check.detail}`);
  const incidents = loadBreachDataFile("incidents.yaml", breachIncidentsFileSchema);
  const holidays = loadBreachDataFile("holidays.yaml", breachHolidaysFileSchema);
  const sources = loadSources();
  if (!incidents) errors.push("incidents.yaml missing");
  if (!holidays) errors.push("holidays.yaml missing");
  if (!sources) errors.push("sources.yaml missing");
  errors.push(...validateIncidents(incidents?.data.incidents ?? []));
  for (const form of sources?.forms ?? []) {
    if (!resolveTemplatePath(form.template))
      errors.push(`form ${form.id}: template missing (${form.template})`);
  }
  return errors;
}

export function runJpDataBreachValidate(): void {
  let errors: string[];
  try {
    errors = collectValidationErrors();
  } catch (error) {
    errors = [`schema error: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (errors.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — breach incident data OK`);
}

function withJurisdiction(
  assessment: BreachAssessment,
  check: JurisdictionCheck
): BreachAssessment {
  if (check.ok) return assessment;
  return {
    ...assessment,
    status: "needs_review",
    provisional: true,
    needs_review: [`req-jp: ${check.detail}`, ...assessment.needs_review],
  };
}

export function runJpDataBreachAssess(opts: { incident: string; json?: boolean }): void {
  const incident = findIncidentOrExit(opts.incident);
  const check = jurisdictionCheck();
  const assessment = withJurisdiction(assessIncident(incident), check);
  if (opts.json) {
    console.log(JSON.stringify({ ...assessment, checks: [check] }, null, 2));
    return;
  }
  console.log(`# 報告対象事態の判定 — ${incident.id}\n`);
  printStatusLine(check.ok, `${check.label} — ${check.detail}`);
  console.log(`判定: **${assessment.status}**${assessment.provisional ? "（暫定 · 要確認）" : ""}`);
  console.log(`高度な暗号化等による除外: ${assessment.exclusion_applied ? "適用" : "非適用"}`);
  for (const label of assessment.triggered_labels) console.log(`- 該当: ${label}`);
  for (const reason of assessment.needs_review) console.log(`- needs_review: ${reason}`);
  console.log(
    `\n義務区分: ${assessment.obligation} · 確報期限日数: ${assessment.final_report_days ?? "—"}`
  );
  console.log(
    "\n※ 準備支援の判定です。報告要否の最終判断は人間（個人情報保護責任者等）が行います。"
  );
}

function formatDeadlineItem(item: DeadlineItem): string {
  const due = item.due_on ? ` · 期限${item.guideline_only ? "目安" : ""} ${item.due_on}` : "";
  const done = item.done_on ? ` · 実施 ${item.done_on}` : "";
  const review = item.needs_review.length
    ? ` · needs_review: ${item.needs_review.join(" / ")}`
    : "";
  const notes = item.status === "not_required" ? "" : ` · ${item.notes.join(" / ")}`;
  return `  - ${item.label}: ${item.status}${due}${done}${review}${notes}`;
}

function summarizeDeadlines(all: readonly IncidentDeadlines[]): Record<string, number> {
  const items = all.flatMap((d) => d.items);
  return {
    overdue: items.filter((i) => i.status === "overdue").length,
    due_soon: items.filter((i) => i.status === "due_soon").length,
    pending: items.filter((i) => i.status === "pending").length,
    done_late: items.filter((i) => i.status === "done_late").length,
    provisional_incidents: all.filter((d) => d.provisional).length,
  };
}

export function runJpDataBreachDeadlines(opts: { asOf?: string; json?: boolean }): void {
  const asOf = opts.asOf ?? currentDate();
  const holidays = loadHolidaySet();
  const check = jurisdictionCheck();
  const incidents = loadIncidents().map((i) =>
    computeIncidentDeadlines(i, assessIncident(i), asOf, holidays)
  );
  const summary = summarizeDeadlines(incidents);
  const passed = check.ok && summary.overdue === 0;
  if (opts.json) {
    console.log(
      JSON.stringify({ as_of: asOf, passed, checks: [check], summary, incidents }, null, 2)
    );
    return;
  }
  console.log(`# 漏えい等報告 期限ウォッチ — as of ${asOf}\n`);
  printStatusLine(check.ok, `${check.label} — ${check.detail}`);
  console.log(
    "日数計算: known_on（知った日）を1日目 · 速報は GL 目安（3日目で警告 · 5日目超で overdue）\n"
  );
  for (const d of incidents) {
    console.log(
      `- \`${d.incident_id}\` · 判定 ${d.assessment_status}${d.provisional ? "（暫定）" : ""} · ${d.obligation}`
    );
    for (const item of d.items) console.log(formatDeadlineItem(item));
  }
  console.log(
    `\noverdue ${summary.overdue} · due_soon ${summary.due_soon} · pending ${summary.pending}`
  );
}

function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{{${key}}}`, value),
    template
  );
}

function formatReportItem(item: ReportItem): string {
  const noticeTag = (INDIVIDUAL_NOTICE_ITEM_NUMBERS as readonly number[]).includes(item.no)
    ? " 〔本人通知事項〕"
    : "";
  return `### (${item.no}) ${item.label}${noticeTag}\n\n${item.value}`;
}

function buildDraftVars(
  incident: BreachIncident,
  kind: BreachReportKind,
  items: readonly ReportItem[],
  deadlines: IncidentDeadlines,
  assessment: BreachAssessment
): Record<string, string> {
  const dueOf = (id: DeadlineItem["id"]) => deadlines.items.find((i) => i.id === id)?.due_on ?? "—";
  const missing = items.filter((i) => i.missing).map((i) => `- (${i.no}) ${i.label}`);
  const sources = loadSources()?.sources ?? [];
  return {
    incident_id: incident.id,
    incident_title: incident.title,
    report_kind: kind,
    generated_on: currentDate(),
    company_name: loadCompany().name,
    recipient_label: RECIPIENT_LABELS[incident.report_recipient],
    assessment_status: assessment.status,
    triggered_labels: assessment.triggered_labels.join(" / ") || "なし",
    preliminary_limit_on: dueOf("preliminary"),
    final_due_on: dueOf("final"),
    report_items_block: items.map(formatReportItem).join("\n\n"),
    missing_items_block: missing.length ? missing.join("\n") : "- なし",
    needs_review_block: assessment.needs_review.map((r) => `- ${r}`).join("\n") || "- なし",
    sources_block: sources
      .map((s) => `- ${s.title} — ${s.url}（取得 ${s.retrieved_on}）`)
      .join("\n"),
  };
}

function loadDraftTemplate(kind: BreachReportKind): string {
  const form = loadSources()?.forms.find((f) => f.kind === kind);
  const templateRel = form?.template ?? DEFAULT_TEMPLATES[kind];
  const path = resolveTemplatePath(templateRel);
  if (!path) throw new Error(`Template not found: ${templateRel}`);
  return readFileSync(path, "utf-8");
}

export function runJpDataBreachDraft(opts: {
  incident: string;
  kind?: BreachReportKind;
  write?: boolean;
  json?: boolean;
  asOf?: string;
}): void {
  const kind = opts.kind ?? "preliminary";
  const incident = findIncidentOrExit(opts.incident);
  const assessment = withJurisdiction(assessIncident(incident), jurisdictionCheck());
  const deadlines = computeIncidentDeadlines(
    incident,
    assessment,
    opts.asOf ?? currentDate(),
    loadHolidaySet()
  );
  const items = buildReportItems(incident, assessment);
  const content = renderTemplate(
    loadDraftTemplate(kind),
    buildDraftVars(incident, kind, items, deadlines, assessment)
  );
  const outputPath = join(resolveBreachDocsDir(), incident.id, `${kind}-report.md`);
  const written = opts.write ? writeTrackedFile(outputPath, content) : null;
  const missingItems = items.filter((i) => i.missing).map((i) => i.no);
  if (opts.json) {
    const result = {
      incident_id: incident.id,
      kind,
      assessment: assessment.status,
      missing_items: missingItems,
    };
    console.log(
      JSON.stringify({ ...result, written: Boolean(written), output_path: outputPath }, null, 2)
    );
    return;
  }
  if (written) {
    console.log(`✓ wrote ${written}`);
  } else {
    console.log(content);
    console.log("\n---\n`--write` で docs/compliance/privacy/breach/<incident-id>/ に保存");
  }
  if (kind === "final" && missingItems.length) {
    console.log(
      `⚠ 確報は全事項が必要 — 未把握 (${missingItems.join(", ")}) は判明次第追完（通則編GL 3-5-3-4）`
    );
  }
}
