import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEventType } from "../../../schemas/audit-log.js";
import { orgAuditBridgeErrorsSchema } from "../../../schemas/org/audit-bridge-errors.js";
import { getOrgAuditBridgeErrorsPath } from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export function loadOrgAuditBridgeErrors() {
  const path = getOrgAuditBridgeErrorsPath();
  if (!existsSync(path)) {
    return orgAuditBridgeErrorsSchema.parse({ recent: [] });
  }
  return readYamlFile(path, orgAuditBridgeErrorsSchema);
}

export function recordAuditBridgeFailure(options: {
  auditId: string;
  auditEvent: AuditEventType;
  message: string;
}): void {
  const path = getOrgAuditBridgeErrorsPath();
  const state = loadOrgAuditBridgeErrors();
  state.recent.push({
    audit_id: options.auditId,
    audit_event: options.auditEvent,
    message: options.message,
    recorded_at: new Date().toISOString(),
  });
  const max = state.max_entries ?? 50;
  if (state.recent.length > max) {
    state.recent = state.recent.slice(-max);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, state);
}

export function listRecentAuditBridgeFailures(): ReturnType<typeof loadOrgAuditBridgeErrors>["recent"] {
  return loadOrgAuditBridgeErrors().recent;
}

export function clearOrgAuditBridgeErrorsForTests(): void {
  const path = getOrgAuditBridgeErrorsPath();
  if (existsSync(path)) {
    writeYamlFile(path, orgAuditBridgeErrorsSchema.parse({ recent: [] }));
  }
}
