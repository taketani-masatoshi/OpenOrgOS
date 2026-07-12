import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { auditEventSchema, type AuditEvent, type AuditEventType } from "../../schemas/audit-log.js";
import { getTenantId } from "./tenant.js";
import { getDocsReportsDir } from "./utils.js";
import { appendJsonl, loadJsonl } from "./jsonl-store.js";
import { bridgeAuditEventToProtocolChain, ensureOrgAuditBridgeConfig } from "./org/audit-bridge.js";
import { recordAuditBridgeFailure } from "./org/audit-bridge-errors.js";
import { getClock, getIdGenerator } from "./runtime-context.js";

export const AUDIT_LOG_SUBDIR = "audit-log";
export const AUDIT_LOG_FILE = "audit.jsonl";

function auditLogDisabled(): boolean {
  return process.env.ORGOS_AUDIT_LOG_DISABLED === "1";
}

function auditBridgeDisabled(): boolean {
  return process.env.ORGOS_AUDIT_BRIDGE_DISABLED === "1";
}

/** Override path (tests · automation). Default: tenant `docs/reports/audit-log/audit.jsonl`. */
export function auditLogPath(): string {
  const fromEnv = process.env.ORGOS_AUDIT_LOG?.trim();
  if (fromEnv) {
    mkdirSync(dirname(fromEnv), { recursive: true });
    return fromEnv;
  }
  const dir = join(getDocsReportsDir(), AUDIT_LOG_SUBDIR);
  mkdirSync(dir, { recursive: true });
  return join(dir, AUDIT_LOG_FILE);
}

function resolveAuditTenant(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = process.env.ORGOS_AUDIT_TENANT?.trim();
  if (fromEnv) return fromEnv;
  return getTenantId();
}

function generateAuditId(): string {
  return getIdGenerator().uniqueId("AUD");
}

export interface AppendAuditOptions {
  event: AuditEventType;
  ref: string;
  actor?: string;
  detail?: string;
  tenant?: string;
  event_id?: string;
  transaction_id?: string;
}

export function appendAuditEvent(options: AppendAuditOptions): AuditEvent {
  const event = auditEventSchema.parse({
    id: generateAuditId(),
    timestamp: getClock().nowIso(),
    tenant: resolveAuditTenant(options.tenant),
    event: options.event,
    ref: options.ref,
    actor: options.actor,
    detail: options.detail,
    event_id: options.event_id,
    transaction_id: options.transaction_id,
  });
  if (auditLogDisabled()) {
    return event;
  }
  appendJsonl(auditLogPath(), event);
  if (auditBridgeDisabled()) {
    return event;
  }
  try {
    ensureOrgAuditBridgeConfig();
    bridgeAuditEventToProtocolChain(event);
  } catch (e) {
    recordAuditBridgeFailure({
      auditId: event.id,
      auditEvent: event.event,
      message: e instanceof Error ? e.message : String(e),
    });
  }
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
