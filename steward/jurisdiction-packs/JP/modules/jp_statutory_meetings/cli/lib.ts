import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  governanceSettingsFileSchema,
  statutoryMeetingsFileSchema,
  statutoryMeetingsSourcesFileSchema,
  type StatutoryMeeting,
  type StatutoryMeetingsSourcesFile,
} from "../../../../../../schemas/jp-statutory-meetings.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { governanceMeetingsFileSchema } from "../../../../../../src/lib/extension-sot.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
  type ModuleDataLoadSource,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir, loadEnabledModulesSafe } from "../../../../../../src/lib/modules.js";
import { MODULE_DEFAULT_DOCS_ROOT } from "../../../../../../src/lib/tenant-document-zones.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { buildMeetingChecklist, buildMeetingSchedule, type MeetingContext } from "./checklist.js";
import { buildDraftVars, draftDocumentsFor, renderTemplate } from "./draft.js";
import { collectValidationIssues, type StatutoryMeetingsBundle } from "./validation.js";
import { resolveMeetingBody } from "./rules.js";

export * from "./rules.js";
export * from "./checklist.js";
export { buildDraftVars, draftDocumentsFor, toReiwaDate } from "./draft.js";
export { collectValidationIssues, type StatutoryMeetingsBundle } from "./validation.js";

export const MODULE_ID = "jp_statutory_meetings";

const HELD_STATUS = "held";

function loadDataFile<S extends z.ZodTypeAny>(filename: string, schema: S, source: ModuleDataLoadSource): z.output<S> | null {
  const loaded = loadModuleDataFile(MODULE_ID, filename, schema, { source });
  return loaded ? (schema.parse(loaded.data) as z.output<S>) : null;
}

function isSeedPath(path: string): boolean {
  return path.startsWith(getModuleSeedDir(MODULE_ID));
}

/**
 * meetings.yaml is the governance SoT (shared with governance_meeting_prep). When the tenant
 * owns it, statutory details must come from the tenant too — never mixed with fictional seed rows.
 */
export function loadStatutoryMeetingsBundle(): StatutoryMeetingsBundle {
  const meetingsLoaded = loadModuleDataFile(MODULE_ID, "meetings.yaml", governanceMeetingsFileSchema);
  const fromSeed = !meetingsLoaded || isSeedPath(meetingsLoaded.path);
  const source: ModuleDataLoadSource = fromSeed ? "tenant-or-seed" : "tenant";
  return {
    meetings: meetingsLoaded ? governanceMeetingsFileSchema.parse(meetingsLoaded.data) : null,
    statutory: loadDataFile("statutory-meetings.yaml", statutoryMeetingsFileSchema, source),
    settings: loadDataFile("governance-settings.yaml", governanceSettingsFileSchema, source),
    sources: loadDataFile("sources.yaml", statutoryMeetingsSourcesFileSchema, "tenant-or-seed"),
    dataSource: fromSeed ? "seed" : "tenant",
  };
}

export function resolveTemplatePath(templateRel: string): string | null {
  const bare = templateRel.replace(/\.example$/, "");
  const candidates = [
    join(getModuleDataDir(MODULE_ID), bare),
    join(getModuleSeedDir(MODULE_ID), templateRel),
    join(getModuleSeedDir(MODULE_ID), `${bare}.example`),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function meetingDateFor(statutory: StatutoryMeeting, scheduledOn: string): string {
  if (statutory.mode === "written_resolution") return statutory.written_consent?.completed_on ?? scheduledOn;
  return scheduledOn;
}

export function resolveMeetingContext(bundle: StatutoryMeetingsBundle, meetingId: string): MeetingContext | string {
  const base = bundle.meetings?.meetings.find((m) => m.id === meetingId);
  if (!base) return `meeting ${meetingId} not found in meetings.yaml`;
  const statutory = bundle.statutory?.meetings.find((m) => m.meeting_id === meetingId);
  if (!statutory) return `meeting ${meetingId} has no entry in statutory-meetings.yaml`;
  if (!bundle.settings) return "governance-settings.yaml missing";
  const body = resolveMeetingBody(base.kind);
  if (!body) return `meeting ${meetingId}: unsupported kind "${base.kind}" (shareholders | board)`;
  return {
    meetingId,
    body,
    meetingDate: meetingDateFor(statutory, base.scheduled_on),
    held: base.status === HELD_STATUS,
    statutory,
    settings: bundle.settings,
  };
}

function requireMeetingContext(meetingId: string): { ctx: MeetingContext; bundle: StatutoryMeetingsBundle } {
  const bundle = loadStatutoryMeetingsBundle();
  const resolved = resolveMeetingContext(bundle, meetingId);
  if (typeof resolved === "string") {
    console.error(`✗ ${MODULE_ID}: ${resolved}`);
    process.exit(1);
  }
  return { ctx: resolved, bundle };
}

// ---------------------------------------------------------------------------
// show · validate
// ---------------------------------------------------------------------------

export function runJpStatutoryMeetingsShow(opts: { json?: boolean }): void {
  const bundle = loadStatutoryMeetingsBundle();
  const jurisdiction = getResolvedJurisdiction();
  const statutoryById = new Map(bundle.statutory?.meetings.map((m) => [m.meeting_id, m]) ?? []);
  const meetings = (bundle.meetings?.meetings ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    scheduled_on: m.scheduled_on,
    status: m.status ?? "(unset)",
    title: statutoryById.get(m.id)?.title ?? null,
    mode: statutoryById.get(m.id)?.mode ?? null,
  }));
  const summary = {
    jurisdiction: jurisdiction.code,
    data_source: bundle.dataSource,
    company_profile: bundle.settings?.company_profile ?? null,
    meetings: meetings.length,
    statutory_entries: bundle.statutory?.meetings.length ?? 0,
    official_sources: bundle.sources?.sources.length ?? 0,
    templates: bundle.sources?.templates.length ?? 0,
    meetings_list: meetings,
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# ${MODULE_ID}\n`);
  console.log(`法域: ${summary.jurisdiction} · データ: ${summary.data_source} · 会議 ${summary.meetings} · 法定詳細 ${summary.statutory_entries}\n`);
  for (const m of meetings) {
    console.log(`- \`${m.id}\` · ${m.kind} · ${m.scheduled_on} · ${m.status}${m.title ? ` · ${m.title}` : ""}`);
  }
  if (bundle.sources?.sources.length) {
    console.log("\n## 公表資料\n");
    for (const s of bundle.sources.sources) console.log(`- **${s.title}** — ${s.url}`);
  }
}

export function runJpStatutoryMeetingsValidate(): void {
  const bundle = loadStatutoryMeetingsBundle();
  const issues = collectValidationIssues(bundle, (template) => resolveTemplatePath(template) !== null);
  if (issues.length) {
    console.error(`✗ ${MODULE_ID}:`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`✓ ${MODULE_ID} — statutory meetings data OK`);
}

// ---------------------------------------------------------------------------
// schedule · checklist
// ---------------------------------------------------------------------------

export function runJpStatutoryMeetingsSchedule(opts: { meeting: string; asOf?: string; json?: boolean }): void {
  const { ctx } = requireMeetingContext(opts.meeting);
  const schedule = buildMeetingSchedule(ctx, opts.asOf ?? currentDate());
  if (opts.json) {
    console.log(JSON.stringify(schedule, null, 2));
    return;
  }
  console.log(`# Schedule — ${schedule.meeting_id}（${schedule.body} · ${schedule.mode}）\n`);
  console.log(`会日 ${schedule.meeting_date} · 基準 ${schedule.as_of} · 残り ${schedule.days_until_meeting} 日`);
  if (schedule.notice) {
    const n = schedule.notice;
    console.log(`招集通知: 中${n.days}日 · 発出期限 ${n.latest_dispatch_date}（残り ${n.days_remaining} 日）· 書面 ${n.written_required ? "要" : "不要"} · ${n.basis}`);
  }
  if (schedule.record_date) {
    const r = schedule.record_date;
    console.log(`基準日: ${r.record_date} · 行使期限 ${r.window_end} · 範囲内 ${r.meeting_within_window ? "○" : "✗"}${r.public_notice_deadline ? ` · 公告期限 ${r.public_notice_deadline}` : ""}`);
  }
  if (schedule.electronic_provision_start) console.log(`電子提供措置開始日: ${schedule.electronic_provision_start}（needs_review）`);
  console.log("\n## 省略手続");
  for (const p of schedule.omission_paths) console.log(`- ${p.label}（${p.basis}）: ${p.availability} — ${p.detail}`);
  for (const note of schedule.needs_review) console.log(`\n⚠ needs_review: ${note}`);
}

export function runJpStatutoryMeetingsChecklist(opts: { meeting: string; asOf?: string; json?: boolean }): void {
  const { ctx } = requireMeetingContext(opts.meeting);
  const checklist = buildMeetingChecklist(ctx, getResolvedJurisdiction().code, opts.asOf ?? currentDate());
  if (opts.json) {
    console.log(JSON.stringify(checklist, null, 2));
    return;
  }
  const marks = { ok: "✓", issue: "✗", needs_review: "?" } as const;
  console.log(`# Checklist — ${checklist.meeting_id}（${checklist.phase}）\n`);
  for (const c of checklist.checks) console.log(`${marks[c.status]} ${c.label} — ${c.detail}（${c.basis}）`);
  console.log(`\n結果: ${checklist.result} · 準備支援のみ — 適法性の最終判断は人間（取締役・専門家）`);
}

// ---------------------------------------------------------------------------
// draft
// ---------------------------------------------------------------------------

function templateFor(sources: StatutoryMeetingsSourcesFile | null, templateId: string): string {
  const rel = sources?.templates.find((t) => t.id === templateId)?.template;
  const path = rel ? resolveTemplatePath(rel) : null;
  if (!path) throw new Error(`Template not found: ${templateId}`);
  return readFileSync(path, "utf-8");
}

function moduleDocsRoot(): string {
  const configured = loadEnabledModulesSafe().find((m) => m.agent === MODULE_ID)?.docs_root;
  return (configured ?? MODULE_DEFAULT_DOCS_ROOT[MODULE_ID] ?? "docs/company/governance/").replace(/\/$/, "");
}

export function runJpStatutoryMeetingsDraft(opts: { meeting: string; write?: boolean; json?: boolean }): void {
  const { ctx, bundle } = requireMeetingContext(opts.meeting);
  const company = loadCompany();
  const vars = buildDraftVars(ctx, { name: company.name, address: company.address }, bundle.sources);
  const docsRel = join(moduleDocsRoot(), ctx.meetingId);
  const outputs = draftDocumentsFor(ctx.body, ctx.statutory.mode).map((doc) => ({
    name: doc.outputName,
    path: join(docsRel, doc.outputName),
    content: renderTemplate(templateFor(bundle.sources, doc.templateId), vars),
  }));
  const checklistResult = buildMeetingChecklist(ctx, getResolvedJurisdiction().code, currentDate()).result;
  if (opts.write) {
    const absRoot = join(getDocsDir(), docsRel.replace(/^docs\//, ""));
    for (const out of outputs) out.path = writeTrackedFile(join(absRoot, out.name), out.content);
  }
  if (opts.json) {
    const files = outputs.map((o) => ({ name: o.name, path: o.path }));
    const summary = { meeting_id: ctx.meetingId, body: ctx.body, mode: ctx.statutory.mode, checklist_result: checklistResult };
    console.log(JSON.stringify({ ...summary, written: Boolean(opts.write), outputs: files }, null, 2));
    return;
  }
  console.log(`# Draft — ${ctx.meetingId}（ドラフト · 発出・署名は人間）\n`);
  if (checklistResult !== "pass") console.log(`⚠ checklist: ${checklistResult} — \`checklist --meeting ${ctx.meetingId}\` を先に確認`);
  for (const out of outputs) {
    if (opts.write) {
      console.log(`✓ wrote ${out.path}`);
      continue;
    }
    console.log(`\n<!-- ${out.name} -->\n${out.content}`);
  }
  if (!opts.write) console.log(`\n---\n\`--write\` で ${docsRel}/ に保存`);
}
