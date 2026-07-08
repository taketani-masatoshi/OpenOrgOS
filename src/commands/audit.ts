import { appendAuditEvent, listAuditEvents } from "../lib/audit-log.js";
import { auditEventTypeSchema } from "../../schemas/audit-log.js";
import { setTenantId } from "../lib/tenant.js";

export interface AuditLogAppendOptions {
  event: string;
  ref: string;
  actor?: string;
  detail?: string;
  tenant?: string;
}

export function runAuditLogAppend(opts: AuditLogAppendOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const parsed = auditEventTypeSchema.safeParse(opts.event);
  if (!parsed.success) {
    console.error(`Unknown event: ${opts.event}`);
    console.error("Use: handoff | validate | classification_block | escalate | route_dispatch");
    process.exit(1);
  }
  const event = appendAuditEvent({
    event: parsed.data,
    ref: opts.ref,
    actor: opts.actor,
    detail: opts.detail,
    tenant: opts.tenant,
  });
  console.log(`✓ ${event.id} · ${event.event} · ${event.ref}`);
}

export interface AuditLogListOptions {
  since?: string;
  tenant?: string;
  event?: string;
  json?: boolean;
}

export function runAuditLogList(opts: AuditLogListOptions): void {
  if (opts.tenant) setTenantId(opts.tenant);
  const eventFilter = opts.event ? auditEventTypeSchema.safeParse(opts.event) : null;
  if (opts.event && !eventFilter?.success) {
    console.error(`Unknown event filter: ${opts.event}`);
    process.exit(1);
  }

  const events = listAuditEvents({
    since: opts.since,
    tenant: opts.tenant,
    event: eventFilter?.success ? eventFilter.data : undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }

  if (events.length === 0) {
    console.log("No audit events.");
    return;
  }

  console.log("| timestamp | event | ref | tenant |");
  console.log("|-----------|-------|-----|--------|");
  for (const e of events.slice(-50)) {
    console.log(`| ${e.timestamp.slice(0, 19)} | ${e.event} | ${e.ref} | ${e.tenant} |`);
  }
  if (events.length > 50) {
    console.log(`\n… ${events.length - 50} older events omitted`);
  }
}
