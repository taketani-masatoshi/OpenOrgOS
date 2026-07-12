import { resolve } from "node:path";
import { getTenantDir, getTenantId } from "./tenant.js";

const CROSS_ORG_PATTERNS = [
  /steward:\/\/tenant\//i,
  /org_uri/i,
  /peer[_-]?id/i,
  /PEER-\d+/i,
  /protocol\.notice/i,
  /cross[_-]?org/i,
];

const EXTERNAL_AGENT_PREFIXES = ["peer:", "external:", "hub-", "org:"];

export function assertActiveTenant(tenant: string | undefined, context: string): void {
  const active = getTenantId();
  if (!tenant) return;
  if (tenant !== active) {
    throw new Error(
      `${context}: tenant mismatch — record tenant "${tenant}" ≠ active tenant "${active}"`
    );
  }
}

export function assertIntraOrgAgentTarget(toAgent: string, context: string): void {
  const agent = toAgent.trim();
  if (!agent) {
    throw new Error(`${context}: agent target is required`);
  }

  for (const prefix of EXTERNAL_AGENT_PREFIXES) {
    if (agent.toLowerCase().startsWith(prefix)) {
      throw new Error(
        `${context}: cross-org agent target "${agent}" is not allowed — use protocol notice for inter-org communication`
      );
    }
  }

  for (const pattern of CROSS_ORG_PATTERNS) {
    if (pattern.test(agent)) {
      throw new Error(`${context}: cross-org reference in agent target "${agent}" is not allowed`);
    }
  }
}

export function assertIntraOrgText(text: string, context: string): void {
  for (const pattern of CROSS_ORG_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error(
        `${context}: cross-org reference detected — inter-org actions require protocol notice + human approval`
      );
    }
  }
}

/** Tenant-scoped cwd for shell/cursor dispatch — prevents workspace-wide edits. */
export function tenantDispatchRoot(): string {
  return resolve(getTenantDir());
}

export function assertDispatchCwdWithinTenant(cwd: string): void {
  const root = tenantDispatchRoot();
  const resolved = resolve(cwd);
  if (resolved !== root && !resolved.startsWith(root + "/")) {
    throw new Error(`Shell dispatch cwd "${cwd}" escapes tenant directory ${root}`);
  }
}
