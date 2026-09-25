import {
  etaxAuditEventSchema,
  type EtaxAuditEvent,
  type EtaxAuditEventType,
} from "../../../schemas/etax/events.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { getTenantId } from "../tenant.js";
import { resolveModuleDataFile } from "../module-business-data.js";
import { getClock, getIdGenerator } from "../runtime-context.js";
import { ETAX_MODULE_ID } from "./constants.js";
import { redactEtaxRecord } from "./redact.js";

export function etaxAuditPath(): string {
  return resolveModuleDataFile(ETAX_MODULE_ID, "audit.jsonl");
}

export function appendEtaxAudit(
  partial: Omit<EtaxAuditEvent, "id" | "timestamp" | "tenant"> & {
    id?: string;
    timestamp?: string;
    tenant?: string;
  },
): EtaxAuditEvent {
  const record = etaxAuditEventSchema.parse(
    redactEtaxRecord({
      id: partial.id ?? getIdGenerator().uniqueId("ETAX-AUD"),
      timestamp: partial.timestamp ?? getClock().now().toISOString(),
      tenant: partial.tenant ?? getTenantId() ?? "unknown",
      actor: partial.actor,
      action: partial.action,
      objectId: partial.objectId,
      contentHash: partial.contentHash,
      specVersion: partial.specVersion,
      result: partial.result,
      detail: partial.detail,
    }),
  );
  appendJsonl(etaxAuditPath(), record);
  return record;
}

export function listEtaxAudit(opts?: {
  action?: EtaxAuditEventType;
  objectId?: string;
  limit?: number;
}): EtaxAuditEvent[] {
  const rows = loadJsonl(etaxAuditPath(), (raw) => etaxAuditEventSchema.parse(raw));
  let filtered = rows;
  if (opts?.action) filtered = filtered.filter((row) => row.action === opts.action);
  if (opts?.objectId) filtered = filtered.filter((row) => row.objectId === opts.objectId);
  return filtered.slice(-(opts?.limit ?? 100));
}
