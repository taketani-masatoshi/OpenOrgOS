/**
 * Append-only medical-device operational audit (L1 only — no patient PII).
 * Path: tenants/{id}/data/medical-device/audit.jsonl (gitignored).
 */
import {
  medicalDeviceAuditEventSchema,
  type MedicalDeviceAuditEvent,
} from "../../../schemas/jp-medical-device.js";
import { appendJsonl, loadJsonl } from "../jsonl-store.js";
import { getTenantId } from "../tenant.js";
import { resolveModuleDataFile } from "../module-business-data.js";

export const MODULE_ID = "jp_medical_device";

export function medicalDeviceAuditPath(): string {
  return resolveModuleDataFile(MODULE_ID, "audit.jsonl");
}

export function appendMedicalDeviceAudit(
  partial: Omit<MedicalDeviceAuditEvent, "timestamp" | "tenant"> & {
    timestamp?: string;
    tenant?: string;
  }
): MedicalDeviceAuditEvent {
  const record = medicalDeviceAuditEventSchema.parse({
    timestamp: partial.timestamp ?? new Date().toISOString(),
    tenant: partial.tenant ?? getTenantId() ?? "unknown",
    actor: partial.actor,
    op: partial.op,
    entity_type: partial.entity_type,
    entity_id: partial.entity_id,
    summary: partial.summary,
    detail: partial.detail,
  });
  appendJsonl(medicalDeviceAuditPath(), record);
  return record;
}

export function listMedicalDeviceAudit(opts?: {
  limit?: number;
  op?: string;
  entityId?: string;
}): MedicalDeviceAuditEvent[] {
  const rows = loadJsonl(medicalDeviceAuditPath(), (raw) =>
    medicalDeviceAuditEventSchema.parse(raw)
  );
  let filtered = rows;
  if (opts?.op) filtered = filtered.filter((r) => r.op === opts.op);
  if (opts?.entityId) filtered = filtered.filter((r) => r.entity_id === opts.entityId);
  const limit = opts?.limit ?? 50;
  return filtered.slice(-limit);
}
