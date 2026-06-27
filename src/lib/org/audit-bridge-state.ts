import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { orgAuditBridgeStateSchema } from "../../../schemas/org/audit-bridge-state.js";
import { getOrgAuditBridgeStatePath } from "./paths.js";
import { readYamlFile, writeYamlFile } from "../utils.js";

export function loadOrgAuditBridgeState() {
  const path = getOrgAuditBridgeStatePath();
  if (!existsSync(path)) {
    return orgAuditBridgeStateSchema.parse({ bridged_audit_ids: [] });
  }
  return readYamlFile(path, orgAuditBridgeStateSchema);
}

export function isAuditEventBridged(auditId: string): boolean {
  return loadOrgAuditBridgeState().bridged_audit_ids.includes(auditId);
}

export function markAuditEventBridged(auditId: string): void {
  const path = getOrgAuditBridgeStatePath();
  const state = loadOrgAuditBridgeState();
  if (state.bridged_audit_ids.includes(auditId)) return;
  state.bridged_audit_ids.push(auditId);
  mkdirSync(dirname(path), { recursive: true });
  writeYamlFile(path, state);
}

export function clearOrgAuditBridgeStateForTests(): void {
  const path = getOrgAuditBridgeStatePath();
  if (existsSync(path)) {
    writeYamlFile(path, orgAuditBridgeStateSchema.parse({ bridged_audit_ids: [] }));
  }
}
