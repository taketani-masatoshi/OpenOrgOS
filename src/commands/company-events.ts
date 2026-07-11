import {
  COMPANY_EVENT_KINDS,
  archiveCompanyEvent,
  backfillCompanyEventChain,
  closeCompanyEvent,
  companyEventChainPath,
  createCompanyEvent,
  ensureCompanyEventMonth,
  findCompanyEventById,
  getCompanyEventChainTail,
  initCompanyEventsFile,
  listCompanyEvents,
  loadCompanyEvents,
  parseMonth,
  refreshAllCompanyEventIndexes,
  registerArtifactFiles,
  saveCompanyEvents,
  validateCompanyEvents,
  verifyCompanyEventChain,
  voidCompanyEvent,
  type CreateCompanyEventOptions,
} from "../lib/company-events.js";
import { linkOutboxItemToEvent } from "../lib/document-io.js";
import { validateCompanyEventChainWithRegistry } from "../lib/company-events-chain.js";
import {
  assertCanVoidCompanyEvent,
  getCompanyEventWireStatus,
  proposeVoidWireForCompanyEvent,
  registerCompanyEventVoidAck,
  tryAutoRegisterVoidAckFromInbound,
} from "../lib/company-events-wire.js";
import {
  runMonthlyCompanyEventsAudit,
  runWeeklyCompanyEventsAttestation,
} from "../lib/company-events-attestation.js";

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
  const kind = opts.kind as (typeof COMPANY_EVENT_KINDS)[number];
  if (!COMPANY_EVENT_KINDS.includes(kind)) {
    throw new Error(`Invalid kind. Use: ${COMPANY_EVENT_KINDS.join(", ")}`);
  }
  initCompanyEventsFile();
  ensureCompanyEventMonth(parseMonth(opts.date?.slice(0, 7)));

  const event = createCompanyEvent({
    kind,
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

export function runEventsList(opts: {
  month?: string;
  status?: string;
  json?: boolean;
  includeVoided?: boolean;
}): void {
  initCompanyEventsFile();
  const events = listCompanyEvents({
    month: opts.month,
    status: opts.status as ReturnType<typeof listCompanyEvents>[number]["status"] | undefined,
    includeVoided: opts.includeVoided,
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

export function runEventsVoid(opts: { id: string; reason: string }): void {
  initCompanyEventsFile();
  const target = findCompanyEventById(opts.id);
  if (!target) {
    throw new Error(`Event not found: ${opts.id}`);
  }
  assertCanVoidCompanyEvent(target);
  const { voidEvent, target: voided } = voidCompanyEvent(opts.id, opts.reason);
  console.log(`✓ Company event voided: ${voided.id}`);
  console.log(`  void_event: ${voidEvent.id}`);
  console.log(`  reason: ${opts.reason}`);
}

export function runEventsVoidRequest(opts: {
  id: string;
  operator: string;
  peer?: string;
  message?: string;
}): void {
  initCompanyEventsFile();
  const notice = proposeVoidWireForCompanyEvent({
    companyEventId: opts.id,
    proposedBy: opts.operator,
    peerId: opts.peer,
    message: opts.message,
  });
  console.log(`✓ Void request wire proposed: ${notice.notice_id}`);
  console.log(`  company_event: ${opts.id}`);
  console.log(`  peer: ${notice.peer_id}`);
  console.log(`  correlation: ${notice.correlation_event_id}`);
  console.log(`  Next: orgos protocol notice approve --id ${notice.notice_id} --approver <CEO>`);
}

export function runEventsVoidAck(opts: {
  id: string;
  wireEvent: string;
  peer?: string;
  auto?: boolean;
}): void {
  initCompanyEventsFile();
  if (opts.auto) {
    const updated = tryAutoRegisterVoidAckFromInbound(opts.id);
    if (!updated) {
      throw new Error(`No inbound void acknowledgment found for ${opts.id}`);
    }
    console.log(`✓ Void acknowledgment auto-registered: ${opts.id}`);
    console.log(`  void_ack_wire_event_id: ${updated.wire_binding?.void_ack_wire_event_id}`);
    return;
  }
  const updated = registerCompanyEventVoidAck({
    companyEventId: opts.id,
    wireEventId: opts.wireEvent,
    peerId: opts.peer,
  });
  console.log(`✓ Void acknowledgment registered: ${opts.id}`);
  console.log(`  void_ack_wire_event_id: ${updated.wire_binding?.void_ack_wire_event_id}`);
  console.log(`  void_ack_at: ${updated.wire_binding?.void_ack_at}`);
}

export async function runEventsAuditMonthly(opts: {
  month?: string;
  notify?: boolean;
  output?: string;
  json?: boolean;
}): Promise<void> {
  initCompanyEventsFile();
  const result = await runMonthlyCompanyEventsAudit({
    month: opts.month,
    notify: opts.notify !== false,
    output: opts.output,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
    return;
  }
  console.log(result.ok ? "✓ Monthly company events audit PASS" : "✗ Monthly audit FAILED");
  console.log(`  month: ${result.month}`);
  console.log(`  chain_checked: ${result.chain_checked}`);
  console.log(`  attestations: ${result.attestations_in_period.length}`);
  console.log(`  report: ${result.report_path}`);
  console.log(`  notified: ${result.notification_sent}`);
  for (const f of result.findings) {
    console.log(`  [${f.severity}] ${f.code}: ${f.message}`);
  }
  if (!result.ok) process.exit(1);
}

export function runEventsChainAttest(opts: { force?: boolean; json?: boolean }): void {
  initCompanyEventsFile();
  const result = runWeeklyCompanyEventsAttestation({ force: opts.force });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.skipped) {
    console.log(`✓ Weekly attestation already exists: ${result.attestation.attestation_id}`);
    return;
  }
  console.log(`✓ Weekly company events attestation signed: ${result.attestation.attestation_id}`);
  console.log(`  chain_tail: ${result.attestation.chain_tail_link_id ?? "—"} seq ${result.attestation.chain_tail_seq ?? 0}`);
  console.log(`  links_since_prev: ${result.attestation.links_since_prev}`);
  console.log(`  → ${result.path}`);
}

export function runEventsWireStatus(opts: { id: string; json?: boolean }): void {
  initCompanyEventsFile();
  const status = getCompanyEventWireStatus(opts.id);
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`Wire status: ${status.event_id}`);
  console.log(`  void_blocked: ${status.void_blocked}`);
  if (status.pending_void_request_notice_id) {
    console.log(`  void_request_notice: ${status.pending_void_request_notice_id}`);
  }
  for (const exp of status.exposures) {
    console.log(`  exposure: peer=${exp.peer_id} wire=${exp.wire_event_id}`);
    if (exp.void_ack_wire_event_id) {
      console.log(`    void_ack: ${exp.void_ack_wire_event_id}`);
    }
  }
  if (status.void_block_reason) {
    console.log(status.void_block_reason);
  }
}

export function runEventsChainVerify(opts: { json?: boolean }): void {
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const chain = verifyCompanyEventChain();
  const cross = validateCompanyEventChainWithRegistry(registry);
  const issues = [...chain.issues, ...cross.issues];
  const ok = chain.ok && cross.ok;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          chain_checked: chain.checked,
          issues,
        },
        null,
        2
      )
    );
    if (!ok) process.exit(1);
    return;
  }

  console.log(ok ? "✓ Company event chain OK" : "✗ Company event chain verification failed");
  for (const issue of issues) {
    console.log(`  [error] ${issue.code}: ${issue.message}`);
  }
  if (!ok) process.exit(1);
  console.log(`  registry_events: ${registry.events.length}`);
  console.log(`  chain_links: ${chain.checked}`);
}

export function runEventsChainBackfill(opts: { force?: boolean }): void {
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const result = backfillCompanyEventChain(registry, { force: opts.force });
  saveCompanyEvents(result.registry);
  console.log(`✓ Company event chain backfilled`);
  console.log(`  events: ${result.events}`);
  console.log(`  links: ${result.links}`);
  console.log(`  → ${companyEventChainPath()}`);
}

export function runEventsChainTail(): void {
  initCompanyEventsFile();
  const tail = getCompanyEventChainTail();
  if (!tail) {
    console.log("Company event chain: empty");
    return;
  }
  console.log(`Company event chain tail: ${tail.link_id}`);
  console.log(`  seq: ${tail.seq}`);
  console.log(`  action: ${tail.action}`);
  console.log(`  event_id: ${tail.event_id}`);
  console.log(`  digest: ${tail.digest}`);
  console.log(`  → ${companyEventChainPath()}`);
}
