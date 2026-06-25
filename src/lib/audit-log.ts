import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { auditEventSchema, type AuditEvent, type AuditEventType } from "../../schemas/audit-log.js";
import { getTenantId } from "./tenant.js";
import { DOCS_REPORTS_DIR } from "./utils.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";

export const AUDIT_LOG_SUBDIR = "audit-log";
export const AUDIT_LOG_FILE = "audit.jsonl";

export function auditLogPath(): string {
  const dir = join(DOCS_REPORTS_DIR, AUDIT_LOG_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return join(dir, AUDIT_LOG_FILE);
}

function generateAuditId(): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `AUD-${Date.now()}-${suffix}`;
}

export interface AppendAuditOptions {
  event: AuditEventType;
  ref: string;
  actor?: string;
  detail?: string;
  tenant?: string;
}

export function appendAuditEvent(options: AppendAuditOptions): AuditEvent {
  const event = auditEventSchema.parse({
    id: generateAuditId(),
    timestamp: new Date().toISOString(),
    tenant: options.tenant ?? getTenantId(),
    event: options.event,
    ref: options.ref,
    actor: options.actor,
    detail: options.detail,
  });
  appendJsonl(auditLogPath(), event);
  return event;
}

export function listAuditEvents(filter?: {
  since?: string;
  tenant?: string;
  event?: AuditEventType;
}): AuditEvent[] {
  const events = loadJsonl(auditLogPath(), (raw) => auditEventSchema.parse(raw));

  return events.filter((e) => {
    if (filter?.tenant && e.tenant !== filter.tenant) return false;
    if (filter?.event && e.event !== filter.event) return false;
    if (filter?.since && e.timestamp.slice(0, 10) < filter.since) return false;
    return true;
  });
}
