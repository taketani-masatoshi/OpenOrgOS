import {
  COMPANY_EVENT_KINDS,
  archiveCompanyEvent,
  closeCompanyEvent,
  createCompanyEvent,
  ensureCompanyEventMonth,
  findCompanyEventById,
  initCompanyEventsFile,
  listCompanyEvents,
  loadCompanyEvents,
  parseMonth,
  refreshAllCompanyEventIndexes,
  registerArtifactFiles,
  validateCompanyEvents,
  type CreateCompanyEventOptions,
} from "../lib/company-events.js";
import { linkOutboxItemToEvent } from "../lib/document-io.js";
import type { CompanyEventKind } from "../../schemas/company-events.js";

function parseRelated(raw?: string): CreateCompanyEventOptions["related"] | undefined {
  if (!raw) return undefined;
  const related: NonNullable<CreateCompanyEventOptions["related"]> = {};
  for (const part of raw.split(",")) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (key && value) {
      related[key.trim() as keyof typeof related] = value;
    }
  }
  return Object.keys(related).length ? related : undefined;
}

export function runEventsEnsureMonth(opts: { month?: string; refreshIndex?: boolean }): void {
  initCompanyEventsFile();
  if (opts.refreshIndex && !opts.month) {
    const months = refreshAllCompanyEventIndexes();
    console.log(`✓ Company event indexes refreshed (${months.length} month(s))`);
    return;
  }
  const result = ensureCompanyEventMonth(opts.month, { refreshIndex: opts.refreshIndex });
  console.log(`✓ Company event month ready: ${result.month}`);
  console.log(`  events:    ${result.eventsDirRel}`);
  console.log(`  artifacts: ${result.artifactsDirRel}`);
  if (opts.refreshIndex) {
    console.log(`  index:     refreshed _INDEX.md`);
  }
}

export function runEventsNew(opts: {
  kind: string;
  title: string;
  date?: string;
  slug?: string;
  related?: string;
  notes?: string;
}): void {
  if (!COMPANY_EVENT_KINDS.includes(opts.kind as CompanyEventKind)) {
    throw new Error(`Invalid kind. Use: ${COMPANY_EVENT_KINDS.join(", ")}`);
  }
  initCompanyEventsFile();
  ensureCompanyEventMonth(parseMonth(opts.date?.slice(0, 7)));

  const event = createCompanyEvent({
    kind: opts.kind as CompanyEventKind,
    title: opts.title,
    occurredAt: opts.date,
    slug: opts.slug,
    related: parseRelated(opts.related),
    notes: opts.notes,
  });

  console.log(`✓ Company event created: ${event.id}`);
  console.log(`  record:    ${event.event_path}`);
  console.log(`  artifacts: ${event.artifact_dir}`);
}

export function runEventsList(opts: { month?: string; status?: string; json?: boolean }): void {
  initCompanyEventsFile();
  const events = listCompanyEvents({
    month: opts.month,
    status: opts.status as ReturnType<typeof listCompanyEvents>[number]["status"] | undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify({ count: events.length, events }, null, 2));
    return;
  }

  if (!events.length) {
    console.log("Company events: 項目なし");
    return;
  }

  console.log("ID\tDate\tKind\tStatus\tTitle");
  console.log("-".repeat(90));
  for (const e of events) {
    console.log(`${e.id}\t${e.occurred_at}\t${e.kind}\t${e.status}\t${e.title}`);
  }
}

export function runEventsStatus(): void {
  initCompanyEventsFile();
  const data = loadCompanyEvents();
  const open = data.events.filter((e) => e.status === "open").length;
  console.log(`Company events registry: ${data.events.length} total (${open} open)`);
  console.log(`  → data/company-events.yaml`);
}

export function runEventsClose(opts: { id: string }): void {
  initCompanyEventsFile();
  const event = closeCompanyEvent(opts.id);
  console.log(`✓ Company event closed: ${event.id}`);
  console.log(`  closed_at: ${event.closed_at}`);
}

export function runEventsArchive(opts: { id: string }): void {
  initCompanyEventsFile();
  const event = archiveCompanyEvent(opts.id);
  console.log(`✓ Company event archived: ${event.id}`);
  console.log(`  closed_at: ${event.closed_at}`);
}

export function runEventsValidate(opts: { json?: boolean }): void {
  initCompanyEventsFile();
  const result = validateCompanyEvents();
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  console.log(result.ok ? "✓ Company events OK" : "✗ Company events validation failed");
  for (const issue of result.issues) {
    console.log(`  [error] ${issue.code}: ${issue.message}`);
  }
  for (const warning of result.warnings) {
    console.log(`  [warn] ${warning.code}: ${warning.message}`);
  }
  if (!result.ok) process.exit(1);
}

export function runEventsRegisterArtifact(opts: {
  id: string;
  files: string;
  kind?: string;
}): void {
  initCompanyEventsFile();
  const names = opts.files.split(",").map((f) => f.trim()).filter(Boolean);
  if (!names.length) {
    throw new Error("Specify --files as comma-separated filenames");
  }
  const event = registerArtifactFiles(opts.id, names, { kind: opts.kind });
  console.log(`✓ Artifact index updated: ${event.id}`);
  console.log(`  index: ${event.artifact_dir}00-artifact-index.md`);
  console.log(`  files: ${names.join(", ")}`);
}

export function runEventsLinkOutbox(opts: { eventId: string; outboxId: string }): void {
  initCompanyEventsFile();
  const event = findCompanyEventById(opts.eventId);
  if (!event) {
    throw new Error(`Event not found: ${opts.eventId}`);
  }
  const item = linkOutboxItemToEvent(opts.outboxId, opts.eventId);
  console.log(`✓ Outbox ${item.id} linked to event ${opts.eventId}`);
  console.log(`  path: ${item.path}`);
}
