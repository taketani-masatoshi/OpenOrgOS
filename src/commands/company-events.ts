import {
  COMPANY_EVENT_KINDS,
  adoptCompanyEventFromMarkdown,
  archiveCompanyEvent,
  listOrphanEventMarkdown,
  pruneOrphanEventMarkdown,
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
import { buildCompanyEventChainReport } from "../lib/company-events-chain-report.js";
import { linkOutboxItemToEvent } from "../lib/document-io.js";
import {
  repairCompanyEventChainFromRegistry,
  validateCompanyEventChainWithRegistry,
} from "../lib/company-events-chain.js";
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
  loadCompanyEventsAttestations,
  verifyCompanyEventsAttestation,
  getAttestationCorruptLines,
  verifyAttestationSequence,
} from "../lib/company-events-attestation.js";
import { requireCliOperator } from "../lib/console-auth/cli-operator.js";
import { appendAuditEvent } from "../lib/audit-log.js";
import { pinCompanyEventChainTail, verifyCompanyEventsWitnessPin } from "../lib/company-events-witness-pin.js";
import { rotateCompanyEventsSigningKey } from "../lib/company-events-signing.js";
import { runMigrateWithValidation } from "../lib/company-events-migrate.js";
import { exportCompanyEventsAuditBundle } from "../lib/company-events-export.js";
import { resolve } from "node:path";

function requireEventsWrite(command: string) {
  return requireCliOperator({ permission: "events:write", command });
}

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
  requireEventsWrite("events new");
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
  requireEventsWrite("events close");
  initCompanyEventsFile();
  const event = closeCompanyEvent(opts.id);
  console.log(`✓ Company event closed: ${event.id}`);
  console.log(`  closed_at: ${event.closed_at}`);
}

export function runEventsArchive(opts: { id: string }): void {
  requireEventsWrite("events archive");
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
  requireEventsWrite("events register-artifact");
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
  requireEventsWrite("events link-outbox");
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
  requireEventsWrite("events void");
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
  requireEventsWrite("events void-request");
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
  requireEventsWrite("events void-ack");
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
  strictLegacy?: boolean;
}): Promise<void> {
  initCompanyEventsFile();
  const result = await runMonthlyCompanyEventsAudit({
    month: opts.month,
    notify: opts.notify !== false,
    output: opts.output,
    strictLegacy: opts.strictLegacy,
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
  requireEventsWrite("events chain attest");
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

export function runEventsChainVerify(opts: {
  json?: boolean;
  strictLegacy?: boolean;
}): void {
  const report = buildCompanyEventChainReport({ strictLegacy: opts.strictLegacy });
  const { ok, issues } = report;

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          ok,
          chain_checked: report.chain_checked,
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
  console.log(`  registry_events: ${report.registry_events}`);
  console.log(`  chain_links: ${report.chain_checked}`);
}

export function runEventsChainBackfill(opts: {
  force?: boolean;
  iUnderstandRebuild?: boolean;
}): void {
  initCompanyEventsFile();
  if (opts.force) {
    const auth = requireEventsWrite("events chain backfill --force");
    if (auth.record.role !== "ceo") {
      throw new Error("events chain backfill --force requires ceo role");
    }
    if (!opts.iUnderstandRebuild) {
      throw new Error(
        "events chain backfill --force requires --i-understand-rebuild (destructive; do not use to recover a broken ledger)",
      );
    }
    if (process.env.ORGOS_EVENTS_CHAIN_REBUILD !== "1") {
      throw new Error(
        "events chain backfill --force is disabled. Set ORGOS_EVENTS_CHAIN_REBUILD=1 only for isolated rebuild, never as recovery.",
      );
    }
    appendAuditEvent({
      event: "events_chain_rebuild",
      ref: "company-events-chain",
      actor: auth.record.operator_id,
      detail: "events chain backfill --force",
    });
  }
  const registry = loadCompanyEvents();
  const result = backfillCompanyEventChain(registry, { force: opts.force });
  saveCompanyEvents(result.registry);
  console.log(`✓ Company event chain backfilled`);
  console.log(`  events: ${result.events}`);
  console.log(`  links: ${result.links}`);
  console.log(`  → ${companyEventChainPath()}`);
}

export function runEventsChainRepair(opts: {
  iUnderstandRepair?: boolean;
  json?: boolean;
}): void {
  const auth = requireEventsWrite("events chain repair");
  if (auth.record.role !== "ceo") {
    throw new Error("events chain repair requires ceo role");
  }
  if (!opts.iUnderstandRepair) {
    throw new Error(
      "events chain repair requires --i-understand-repair (backs up existing chain and rebuilds from registry)",
    );
  }
  initCompanyEventsFile();
  const registry = loadCompanyEvents();
  const result = repairCompanyEventChainFromRegistry(registry, {
    iUnderstandRepair: true,
  });
  saveCompanyEvents(result.registry);
  appendAuditEvent({
    event: "events_chain_repair",
    ref: "company-events-chain",
    actor: auth.record.operator_id,
    detail: `rebuilt ${result.links} links from ${result.events} registry events (was ${result.previous_links} links)`,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Company event chain repaired from registry`);
  console.log(`  events: ${result.events}`);
  console.log(`  links: ${result.links} (was ${result.previous_links})`);
  if (result.backup_path) {
    console.log(`  backup: ${result.backup_path}`);
  }
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

export function runEventsChainPin(): void {
  requireEventsWrite("events chain pin");
  initCompanyEventsFile();
  const pin = pinCompanyEventChainTail();
  console.log(`✓ Company event chain tail pinned`);
  console.log(`  seq: ${pin.chain_tail_seq}`);
  console.log(`  digest: ${pin.chain_tail_digest}`);
  console.log(`  hub: ${pin.hub_id ?? "local-pin"}`);
}

export function runEventsChainRotateKey(opts: { json?: boolean }): void {
  const auth = requireEventsWrite("events chain rotate-key");
  if (auth.record.role !== "ceo") {
    throw new Error("events chain rotate-key requires ceo role");
  }
  initCompanyEventsFile();
  const result = rotateCompanyEventsSigningKey();
  appendAuditEvent({
    event: "events_signing_key_rotate",
    ref: "company-events-signing",
    actor: auth.record.operator_id,
    detail: `${result.previous_key_id} → ${result.new_key_id}`,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Company events signing key rotated`);
  console.log(`  previous: ${result.previous_key_id}`);
  console.log(`  active:   ${result.new_key_id}`);
  console.log(`  history:  ${result.meta.history.length} retired key(s)`);
}

export function runEventsChainMigrate(opts: { dryRun?: boolean; json?: boolean }): void {
  requireEventsWrite("events chain migrate");
  initCompanyEventsFile();
  const result = runMigrateWithValidation({ dryRun: opts.dryRun });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.verify_ok && !opts.dryRun) process.exit(1);
    return;
  }
  console.log(opts.dryRun ? "Dry run — company events chain migrate" : "✓ Company events chain migrated");
  console.log(`  registry: ${result.registry_migrated ? "v3" : "already v3"}`);
  console.log(`  signing_meta: ${result.signing_meta_migrated ? "v2" : "already v2"}`);
  console.log(`  verify: ${result.verify_ok ? "OK" : "FAILED"}`);
  for (const issue of result.issues) {
    console.log(`  [issue] ${issue.code}: ${issue.message}`);
  }
  if (!result.verify_ok && !opts.dryRun) process.exit(1);
}

export function runEventsChainExport(opts: { out: string; json?: boolean }): void {
  requireEventsWrite("events chain export");
  initCompanyEventsFile();
  const outDir = resolve(opts.out);
  const result = exportCompanyEventsAuditBundle(outDir);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`✓ Company events audit bundle exported`);
  console.log(`  → ${result.out_dir}`);
  for (const file of result.files) {
    console.log(`  · ${file}`);
  }
}

export function runEventsAdopt(opts: { id: string; dryRun?: boolean; json?: boolean }): void {
  const auth = requireEventsWrite("events adopt");
  if (auth.record.role !== "ceo") {
    throw new Error("events adopt requires ceo role");
  }
  initCompanyEventsFile();
  const result = adoptCompanyEventFromMarkdown(opts.id, { dryRun: opts.dryRun });
  if (!opts.dryRun) {
    appendAuditEvent({
      event: "events_adopt",
      ref: opts.id,
      actor: auth.record.operator_id,
      detail: `chain_seq=${result.chain_seq ?? "n/a"}`,
    });
  }
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (opts.dryRun) {
    console.log(`Dry run — would adopt: ${result.event.id}`);
  } else {
    console.log(`✓ Company event adopted: ${result.event.id}`);
    console.log(`  chain_seq: ${result.chain_seq ?? "—"}`);
  }
  console.log(`  record:    ${result.event.event_path}`);
  console.log(`  artifacts: ${result.event.artifact_dir}`);
}

export function runEventsOrphans(opts: {
  json?: boolean;
  prune?: boolean;
  dryRun?: boolean;
  iUnderstandPurge?: boolean;
}): void {
  initCompanyEventsFile();
  if (opts.prune) {
    const auth = requireEventsWrite("events orphans --prune");
    if (auth.record.role !== "ceo") {
      throw new Error("events orphans --prune requires ceo role");
    }
    const result = pruneOrphanEventMarkdown({
      dryRun: opts.dryRun,
      iUnderstandPurge: opts.iUnderstandPurge,
    });
    if (!opts.dryRun && result.deleted.length > 0) {
      appendAuditEvent({
        event: "events_orphan_prune",
        ref: "company-events",
        actor: auth.record.operator_id,
        detail: `deleted ${result.deleted.length} orphan(s); skipped tracked ${result.skipped_tracked.length}`,
      });
    }
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (opts.dryRun) {
      console.log(`Dry run — would prune ${result.deleted.length} orphan(s)`);
    } else {
      console.log(`✓ Orphan event markdown pruned: ${result.deleted.length}`);
    }
    if (result.skipped_tracked.length > 0) {
      console.log(`  skipped (git tracked): ${result.skipped_tracked.join(", ")}`);
    }
    for (const id of result.deleted) {
      console.log(`  · ${id}`);
    }
    return;
  }

  const orphans = listOrphanEventMarkdown();
  if (opts.json) {
    console.log(JSON.stringify(orphans, null, 2));
    return;
  }
  if (orphans.length === 0) {
    console.log("✓ No orphan event markdown files");
    return;
  }
  console.log(`Orphan event markdown (${orphans.length}):`);
  for (const o of orphans) {
    console.log(`  ${o.id} · ${o.event_path}${o.git_tracked ? " · git tracked" : ""}`);
  }
}
