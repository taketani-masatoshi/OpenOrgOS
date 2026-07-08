import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  companyEventsRegistrySchema,
  companyEventKind,
  companyEventSchema,
  type CompanyEvent,
  type CompanyEventKind,
  type CompanyEventsRegistry,
} from "../../schemas/company-events.js";
import {
  currentDate,
  getDataDir,
  getDocsDir,
  readYamlFile,
  resolveTenantPath,
  toLogicalPath,
  writeYamlFile,
} from "./utils.js";
import { lintCompanyEventMarkdown } from "./company-events-lint.js";

export const COMPANY_EVENT_KINDS = companyEventKind.options;

const REGISTRY_PATH = () => join(getDataDir(), "company-events.yaml");

export function getDocsCompanyEventsDir(): string {
  return join(getDocsDir(), "company", "events");
}

export function getDocsCompanyArtifactsDir(): string {
  return join(getDocsDir(), "company", "artifacts");
}

export function companyEventsRegistryPath(): string {
  return toLogicalPath(REGISTRY_PATH());
}

export function parseMonth(input?: string): string {
  if (input) {
    if (!/^\d{4}-\d{2}$/.test(input)) {
      throw new Error(`Invalid month (use YYYY-MM): ${input}`);
    }
    const monthNum = Number(input.slice(5, 7));
    if (monthNum < 1 || monthNum > 12) {
      throw new Error(`Invalid month (use YYYY-MM): ${input}`);
    }
    return input;
  }
  const d = currentDate();
  return d.slice(0, 7);
}

export function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

export function loadCompanyEvents(): CompanyEventsRegistry {
  const path = REGISTRY_PATH();
  if (!existsSync(path)) {
    return companyEventsRegistrySchema.parse({ events: [] });
  }
  return readYamlFile(path, companyEventsRegistrySchema);
}

export function saveCompanyEvents(data: CompanyEventsRegistry): void {
  writeYamlFile(REGISTRY_PATH(), data);
}

export function initCompanyEventsFile(): void {
  const path = REGISTRY_PATH();
  if (!existsSync(path)) {
    saveCompanyEvents({ schema_version: 1, events: [] });
  }
}

function slugifyEventSlug(title: string, kind: CompanyEventKind, used: Set<string>): string {
  let base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  if (base.length < 3) {
    base = kind;
  }

  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    const suffix = `-${n}`;
    slug = `${base.slice(0, Math.max(3, 32 - suffix.length))}${suffix}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}

export function buildEventId(
  occurredAt: string,
  kind: CompanyEventKind,
  slug: string
): string {
  const datePart = occurredAt.replace(/-/g, "");
  const cleanSlug = slug.replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug) || cleanSlug.length < 3) {
    throw new Error(`Invalid slug (use a-z0-9 and hyphens, min 3 chars): ${slug}`);
  }
  return `EVT-${datePart}-${kind}-${cleanSlug}`;
}

export interface EnsureMonthResult {
  month: string;
  eventsDir: string;
  artifactsDir: string;
  eventsDirRel: string;
  artifactsDirRel: string;
}

export function refreshCompanyEventMonthIndex(month: string): void {
  initCompanyEventsFile();
  refreshMonthIndex(month, loadCompanyEvents().events);
}

export function refreshAllCompanyEventIndexes(): string[] {
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const months = [...new Set(registry.events.map((e) => e.month))];
  for (const month of months) {
    refreshMonthIndex(month, registry.events);
  }
  return months;
}

export function ensureCompanyEventMonth(
  monthInput?: string,
  opts?: { refreshIndex?: boolean }
): EnsureMonthResult {
  const month = parseMonth(monthInput);
  const eventsDir = join(getDocsCompanyEventsDir(), month);
  const artifactsDir = join(getDocsCompanyArtifactsDir(), month);
  mkdirSync(eventsDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });

  const indexPath = join(eventsDir, "_INDEX.md");
  if (!existsSync(indexPath)) {
    writeFileSync(
      indexPath,
      `# 会社イベント — ${month}\n\n| Event ID | 日付 | kind | タイトル | 状態 |\n|----------|------|------|----------|------|\n`,
      "utf8"
    );
  } else if (opts?.refreshIndex) {
    refreshCompanyEventMonthIndex(month);
  }

  return {
    month,
    eventsDir,
    artifactsDir,
    eventsDirRel: toLogicalPath(eventsDir),
    artifactsDirRel: toLogicalPath(artifactsDir),
  };
}

function renderEventMarkdown(event: CompanyEvent): string {
  const relatedLines = event.related
    ? Object.entries(event.related)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "- （なし）";

  return `---
event_id: ${event.id}
occurred_at: ${event.occurred_at}
kind: ${event.kind}
status: ${event.status}
artifact_dir: ${event.artifact_dir}
---

# ${event.title}

## 概要

（イベントの目的・結果を記載）

## 経緯

- ${event.occurred_at}: イベント記録を作成

## 関連 ID

${relatedLines}

## 出力書類

書類はイベント記録と分離して保管します。

- 索引: \`${event.artifact_dir}00-artifact-index.md\`
- フォルダ: \`${event.artifact_dir}\`
- PDF/scan: \`${event.artifact_dir}records/\`（L2 · gitignore）
`;
}

function renderArtifactIndex(event: CompanyEvent): string {
  return `# 出力書類 — ${event.id}

**イベント:** ${event.title}  
**発生日:** ${event.occurred_at}  
**イベント記録:** \`${event.event_path}\`

## 書類一覧

| ファイル | 種別 | 備考 |
|---------|------|------|
| （未登録） | — | CLI/モジュールで追加 |

## records/（PDF · scan）

\`${event.artifact_dir}records/\` — L2 · gitignore · Privacy Mode 参照のみ
`;
}

function refreshMonthIndex(month: string, events: CompanyEvent[]): void {
  const monthEvents = events
    .filter((e) => e.month === month)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));

  const rows = monthEvents
    .map(
      (e) =>
        `| [${e.id}](./${e.id}.md) | ${e.occurred_at} | ${e.kind} | ${e.title} | ${e.status} |`
    )
    .join("\n");

  const indexPath = join(getDocsCompanyEventsDir(), month, "_INDEX.md");
  writeFileSync(
    indexPath,
    `# 会社イベント — ${month}\n\n| Event ID | 日付 | kind | タイトル | 状態 |\n|----------|------|------|----------|------|\n${rows || "| — | — | — | （イベントなし） | — |"}\n`,
    "utf8"
  );
}

export interface CreateCompanyEventOptions {
  kind: CompanyEventKind;
  title: string;
  occurredAt?: string;
  slug?: string;
  related?: CompanyEvent["related"];
  notes?: string;
}

export function createCompanyEvent(opts: CreateCompanyEventOptions): CompanyEvent {
  initCompanyEventsFile();
  const occurredAt = opts.occurredAt ?? currentDate();
  const month = monthFromDate(occurredAt);
  ensureCompanyEventMonth(month);

  const registry = loadCompanyEvents();
  const usedSlugs = new Set(
    registry.events.map((e) => {
      const parts = e.id.split("-");
      return parts.slice(4).join("-");
    })
  );

  const slug = opts.slug
    ? opts.slug.replace(/^-+|-+$/g, "")
    : slugifyEventSlug(opts.title, opts.kind, usedSlugs);

  const id = buildEventId(occurredAt, opts.kind, slug);
  if (registry.events.some((e) => e.id === id)) {
    throw new Error(`Event already exists: ${id}`);
  }

  const eventPathRel = toLogicalPath(join(getDocsCompanyEventsDir(), month, `${id}.md`));
  const artifactDirRel = toLogicalPath(join(getDocsCompanyArtifactsDir(), month, id)) + "/";

  const event: CompanyEvent = companyEventSchema.parse({
    id,
    occurred_at: occurredAt,
    month,
    kind: opts.kind,
    title: opts.title,
    status: "open",
    event_path: eventPathRel,
    artifact_dir: artifactDirRel,
    related: opts.related,
    notes: opts.notes,
    created_at: currentDate(),
  });

  const artifactDirAbs = join(getDocsCompanyArtifactsDir(), month, id);
  mkdirSync(join(artifactDirAbs, "records"), { recursive: true });
  writeFileSync(join(getDocsCompanyEventsDir(), month, `${id}.md`), renderEventMarkdown(event), "utf8");
  writeFileSync(join(artifactDirAbs, "00-artifact-index.md"), renderArtifactIndex(event), "utf8");

  registry.events.push(event);
  saveCompanyEvents(registry);
  refreshMonthIndex(month, registry.events);

  return event;
}

export function listCompanyEvents(filter?: { month?: string; status?: CompanyEvent["status"] }): CompanyEvent[] {
  initCompanyEventsFile();
  let events = loadCompanyEvents().events;
  if (filter?.month) {
    events = events.filter((e) => e.month === filter.month);
  }
  if (filter?.status) {
    events = events.filter((e) => e.status === filter.status);
  }
  return events.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id));
}

export function artifactDirForEvent(event: Pick<CompanyEvent, "id" | "month">): string {
  return toLogicalPath(join(getDocsCompanyArtifactsDir(), event.month, event.id)) + "/";
}

export function eventPathForId(event: Pick<CompanyEvent, "id" | "month">): string {
  return toLogicalPath(join(getDocsCompanyEventsDir(), event.month, `${event.id}.md`));
}

export function findCompanyEventById(id: string): CompanyEvent | undefined {
  initCompanyEventsFile();
  return loadCompanyEvents().events.find((e) => e.id === id);
}

const STATUS_TRANSITIONS: Record<CompanyEvent["status"], CompanyEvent["status"][]> = {
  open: ["closed", "archived"],
  closed: ["archived"],
  archived: [],
};

export function updateCompanyEventStatus(
  id: string,
  status: Exclude<CompanyEvent["status"], "open">
): CompanyEvent {
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const idx = registry.events.findIndex((e) => e.id === id);
  if (idx < 0) {
    throw new Error(`Event not found: ${id}`);
  }
  const current = registry.events[idx]!;
  const allowed = STATUS_TRANSITIONS[current.status];
  if (!allowed.includes(status)) {
    throw new Error(`Cannot transition ${current.status} → ${status} for ${id}`);
  }

  const updated: CompanyEvent = companyEventSchema.parse({
    ...current,
    status,
    closed_at: currentDate(),
  });

  const eventAbs = join(getDocsCompanyEventsDir(), updated.month, `${updated.id}.md`);
  writeFileSync(eventAbs, renderEventMarkdown(updated), "utf8");

  registry.events[idx] = updated;
  saveCompanyEvents(registry);
  refreshMonthIndex(updated.month, registry.events);
  return updated;
}

export interface CompanyEventValidationIssue {
  code: string;
  message: string;
  event_id?: string;
}

export function validateCompanyEvents(): {
  ok: boolean;
  issues: CompanyEventValidationIssue[];
  warnings: CompanyEventValidationIssue[];
} {
  initCompanyEventsFile();
  const issues: CompanyEventValidationIssue[] = [];
  const warnings: CompanyEventValidationIssue[] = [];
  const registry = loadCompanyEvents();
  const knownIds = new Set(registry.events.map((e) => e.id));

  for (const event of registry.events) {
    const eventAbs = resolveTenantPath(event.event_path);
    if (!existsSync(eventAbs)) {
      issues.push({
        code: "event-md-missing",
        message: `Missing event record: ${event.event_path}`,
        event_id: event.id,
      });
    } else {
      const content = readFileSync(eventAbs, "utf-8");
      for (const lint of lintCompanyEventMarkdown(event, content)) {
        if (lint.severity === "error") issues.push(lint);
        else warnings.push(lint);
      }
    }
    const indexAbs = resolveTenantPath(`${event.artifact_dir}00-artifact-index.md`);
    if (!existsSync(indexAbs)) {
      issues.push({
        code: "artifact-index-missing",
        message: `Missing artifact index: ${event.artifact_dir}00-artifact-index.md`,
        event_id: event.id,
      });
    }
    const recordsAbs = resolveTenantPath(`${event.artifact_dir}records`);
    if (!existsSync(recordsAbs)) {
      warnings.push({
        code: "artifact-records-missing",
        message: `Missing records/: ${event.artifact_dir}records/`,
        event_id: event.id,
      });
    }
    if ((event.status === "closed" || event.status === "archived") && !event.closed_at) {
      warnings.push({
        code: "closed-at-missing",
        message: `Status ${event.status} without closed_at`,
        event_id: event.id,
      });
    }
  }

  const eventsRoot = getDocsCompanyEventsDir();
  if (existsSync(eventsRoot)) {
    for (const monthDir of readdirSync(eventsRoot)) {
      if (!/^\d{4}-\d{2}$/.test(monthDir)) continue;
      const monthPath = join(eventsRoot, monthDir);
      for (const file of readdirSync(monthPath)) {
        if (!file.startsWith("EVT-") || !file.endsWith(".md")) continue;
        const id = file.replace(/\.md$/, "");
        if (!knownIds.has(id)) {
          warnings.push({
            code: "orphan-event-md",
            message: `Event MD not in registry: docs/company/events/${monthDir}/${file}`,
            event_id: id,
          });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues, warnings };
}

export function registerArtifactFiles(
  eventId: string,
  fileNames: string[],
  opts?: { kind?: string }
): CompanyEvent {
  const event = findCompanyEventById(eventId);
  if (!event) {
    throw new Error(`Event not found: ${eventId}`);
  }
  const indexAbs = resolveTenantPath(`${event.artifact_dir}00-artifact-index.md`);
  const kind = opts?.kind ?? "generated-md";
  const rows = fileNames
    .map((name) => `| \`${name}\` | ${kind} | module prepare |`)
    .join("\n");
  const content = `# 出力書類 — ${event.id}

**イベント:** ${event.title}  
**発生日:** ${event.occurred_at}  
**イベント記録:** \`${event.event_path}\`

## 書類一覧

| ファイル | 種別 | 備考 |
|---------|------|------|
${rows}

## records/（PDF · scan）

\`${event.artifact_dir}records/\` — L2 · gitignore · Privacy Mode 参照のみ
`;
  writeFileSync(indexAbs, content, "utf8");
  return event;
}

export function closeCompanyEvent(id: string): CompanyEvent {
  return updateCompanyEventStatus(id, "closed");
}

export function archiveCompanyEvent(id: string): CompanyEvent {
  return updateCompanyEventStatus(id, "archived");
}
