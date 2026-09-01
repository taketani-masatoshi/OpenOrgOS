import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  collectStandingOperatorEmailEntries,
  loadOperatorRegistry,
  registryHasApprovers,
} from "./org/operators.js";
import {
  assertCanAddStandingHuman,
  assertFounderGrandfatherPolicy,
  assertFounderMigrationPolicy,
  findStandingOperatorEmailCollisions,
  listOperatorEmailsOutsideLoginPolicy,
} from "./org/ooo-login-email.js";
import { loadAuthorizedApprovers } from "./org/authorized-approvers.js";
import { isProdSecurityMode } from "./console-auth/operator-rbac.js";
import { OPERATOR_RUNTIME_CONFIG_PATH } from "./steward-paths.js";
import type { AgentId } from "../../schemas/classification.js";
import { checkAgentAccess, loadClassificationRegistry } from "./classification.js";
import { loadAgentCapabilityManifest } from "./agent-capability.js";
import { getTenantLifecycleStatus } from "./org/tenant-lifecycle.js";
import { ROOT_DIR } from "./tenant.js";
import { runModuleTrustPolicyChecks } from "./module-trust-policy.js";

export interface SecurityIssue {
  level: "error" | "warning";
  file: string;
  message: string;
}

/** Sensitive paths — folder policy spot-check (validate --security). */
const FOLDER_POLICY_PROBE_PATHS = [
  "data/finance/bank-accounts.yaml",
  "data/executive/stakeholders.yaml",
  "data/contracts/",
] as const;

function agentClaimsPath(agentPrefixes: string[], resourcePath: string): boolean {
  const norm = resourcePath.replace(/\\/g, "/");
  return agentPrefixes.some((p) => {
    const prefix = p.replace(/\\/g, "/");
    return norm === prefix || norm.startsWith(prefix) || prefix.startsWith(norm);
  });
}

export function runAgentFolderPolicyChecks(): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  let registry;
  try {
    registry = loadClassificationRegistry();
  } catch {
    return issues;
  }

  let manifest;
  try {
    manifest = loadAgentCapabilityManifest();
  } catch (err) {
    issues.push({
      level: "warning",
      file: "steward/core/agents/agent-capability-manifest.yaml",
      message: err instanceof Error ? err.message : "manifest parse failed",
    });
    return issues;
  }

  for (const entry of manifest) {
    const agentId = entry.id as AgentId;
    const prefixes = [...(entry.data_paths ?? []), ...(entry.docs_paths ?? [])];
    for (const probe of FOLDER_POLICY_PROBE_PATHS) {
      const access = checkAgentAccess(registry, agentId, probe, "write");
      if (!access.allowed) continue;
      if (!agentClaimsPath(prefixes, probe)) {
        issues.push({
          level: "warning",
          file: probe,
          message: `Agent ${agentId} can write ${probe} but path is outside manifest primary folders`,
        });
      }
    }
  }

  return issues;
}

/** Tenants with data/org/ but no operators.yaml (repo-wide). */
export function listTenantsMissingOperatorRegistry(): string[] {
  const tenantsDir = join(ROOT_DIR, "tenants");
  if (!existsSync(tenantsDir)) return [];

  const missing: string[] = [];
  for (const id of readdirSync(tenantsDir, { withFileTypes: true })) {
    if (!id.isDirectory() || id.name.startsWith(".")) continue;
    const orgDir = join(tenantsDir, id.name, "data", "org");
    if (!existsSync(orgDir)) continue;
    const registryPath = join(orgDir, "operators.yaml");
    if (!existsSync(registryPath)) missing.push(id.name);
  }
  return missing.sort();
}

export function runTenantOperatorRegistryChecks(): SecurityIssue[] {
  return listTenantsMissingOperatorRegistry().map((tenantId) => ({
    level: "error" as const,
    file: `tenants/${tenantId}/data/org/operators.yaml`,
    message: "Operator registry missing — run: orgos operator init-registry",
  }));
}

export function runSecurityChecks(): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  const reg = loadOperatorRegistry();
  if (!reg?.operators.length) {
    issues.push({
      level: isProdSecurityMode() ? "error" : "warning",
      file: "data/org/operators.yaml",
      message: "Operator registry missing — run: orgos operator init-registry",
    });
  } else if (!registryHasApprovers()) {
    issues.push({
      level: "error",
      file: "data/org/operators.yaml",
      message: "No ceo/approver operator in registry",
    });
  }

  if (reg) {
    for (const issue of assertFounderGrandfatherPolicy(reg)) {
      issues.push({
        level: "error",
        file: "data/org/operators.yaml",
        message: issue.message,
      });
    }
    for (const issue of assertFounderMigrationPolicy(reg)) {
      issues.push({
        level: isProdSecurityMode() ? "error" : "warning",
        file: "data/org/operators.yaml",
        message: issue.message,
      });
    }
    const standingBlock = assertCanAddStandingHuman(reg);
    if (standingBlock) {
      issues.push({
        level: "error",
        file: "data/org/operators.yaml",
        message: standingBlock.message,
      });
    }
    for (const row of listOperatorEmailsOutsideLoginPolicy(reg)) {
      if (row.reason === "personal_not_founder") continue;
      issues.push({
        level: "error",
        file: "data/org/operators.yaml",
        message: `Operator ${row.operator_id} email is outside login_policy.email_domains (add a company-domain email or an explicit grandfather_emails entry)`,
      });
    }
  }

  const lifecycleStatus = getTenantLifecycleStatus();
  if (lifecycleStatus === "archived") {
    issues.push({
      level: isProdSecurityMode() ? "error" : "warning",
      file: "data/org/tenant-lifecycle.yaml",
      message: "tenant lifecycle is archived — SSO and standing invites are blocked",
    });
  }

  for (const collision of findStandingOperatorEmailCollisions(
    collectStandingOperatorEmailEntries(),
  )) {
    const seatLabel = collision.seats
      .map((s) => `${s.tenantId}/${s.operator_id}`)
      .join(", ");
    issues.push({
      level: "error",
      file: `tenants/${collision.seats[0]?.tenantId ?? "unknown"}/data/org/operators.yaml`,
      message: `Standing operator email used across tenants (${seatLabel}) — each standing OOO seat needs a tenant-unique login email`,
    });
  }

  const approvers = loadAuthorizedApprovers();
  if (approvers.length === 0 && isProdSecurityMode()) {
    issues.push({
      level: "error",
      file: "data/org/operators.yaml",
      message: "No authorized approvers resolved (fail-closed in production)",
    });
  }

  if (!existsSync(OPERATOR_RUNTIME_CONFIG_PATH)) {
    issues.push({
      level: "warning",
      file: OPERATOR_RUNTIME_CONFIG_PATH,
      message: "Operator runtime config missing",
    });
  }

  if (process.env.STEWARD_OPERATOR_AUTH === "0" && isProdSecurityMode()) {
    issues.push({
      level: "error",
      file: "env",
      message: "STEWARD_OPERATOR_AUTH=0 in production",
    });
  }

  if (process.env.ORGOS_MCP_AUTH === "0" && isProdSecurityMode()) {
    issues.push({
      level: "error",
      file: "env",
      message: "ORGOS_MCP_AUTH=0 in production",
    });
  }

  issues.push(...runAgentFolderPolicyChecks());
  issues.push(...runTenantOperatorRegistryChecks());

  for (const m of runModuleTrustPolicyChecks()) {
    issues.push({
      level: isProdSecurityMode() ? "error" : "warning",
      file: m.file,
      message: m.message,
    });
  }

  return issues;
}
