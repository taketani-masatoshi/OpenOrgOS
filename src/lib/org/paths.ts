import { join } from "node:path";
import { getDataDir } from "../utils.js";

export function getOrgDataDir(): string {
  return join(getDataDir(), "org");
}

export function getPendingApprovalsPath(): string {
  return join(getOrgDataDir(), "pending-approvals.yaml");
}

export function getOrgAuditBridgeConfigPath(): string {
  return join(getOrgDataDir(), "audit-bridge.yaml");
}

export function getOrgAuditBridgeStatePath(): string {
  return join(getOrgDataDir(), "audit-bridge-state.yaml");
}
