import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  classificationRegistrySchema,
  bankAccountsFileSchema,
  type AgentId,
  type ClassificationLevel,
  type ClassificationRegistry,
  type BankAccountsFile,
} from "../../schemas/classification.js";

export type { AgentId, ClassificationLevel, ClassificationRegistry, BankAccountsFile };
import { cashBalanceSchema } from "../../schemas/finance.js";
import { ROOT_DIR, getDataDir, readYamlFile, getBankAccountsYaml, getClassificationRegistryYaml } from "./utils.js";

const LEVEL_ORDER: Record<ClassificationLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export function loadClassificationRegistry(): ClassificationRegistry {
  return readYamlFile(getClassificationRegistryYaml(), classificationRegistrySchema);
}

export function loadBankAccounts(): BankAccountsFile | undefined {
  if (!existsSync(getBankAccountsYaml())) return undefined;
  return readYamlFile(getBankAccountsYaml(), bankAccountsFileSchema);
}

export function levelAtMost(a: ClassificationLevel, b: ClassificationLevel): boolean {
  return LEVEL_ORDER[a] <= LEVEL_ORDER[b];
}

export function getAgentMaxLevel(registry: ClassificationRegistry, agent: AgentId): ClassificationLevel {
  return registry.agents[agent]?.max_level ?? "L0";
}

export function getAgentOutputMaxLevel(
  registry: ClassificationRegistry,
  agent: AgentId
): ClassificationLevel {
  return registry.agents[agent]?.output_max_level ?? getAgentMaxLevel(registry, agent);
}

export function findResourceByPath(registry: ClassificationRegistry, resourcePath: string) {
  const normalized = resourcePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return registry.resources.find((r) => {
    if (r.path.includes("*")) {
      const prefix = r.path.replace(/\*\*\/\*\*$/, "").replace(/\*$/, "");
      return normalized.startsWith(prefix) || normalized.includes(prefix.replace(/\//g, ""));
    }
    return normalized === r.path || normalized.endsWith("/" + r.path);
  });
}

/**
 * Write-time gate: a git-tracked write to a path matching a `git: ignore`
 * (L2/secret) resource is a leak. Returns the offending resource id, or
 * undefined when the path is safe to track.
 */
export function unsafeTrackedResource(
  registry: ClassificationRegistry,
  logicalPath: string
): string | undefined {
  const resource = findResourceByPath(registry, logicalPath);
  if (resource && resource.git === "ignore") return resource.id;
  return undefined;
}

export function assertSafeTrackedPath(logicalPath: string): void {
  const offender = unsafeTrackedResource(loadClassificationRegistry(), logicalPath);
  if (offender) {
    throw new Error(
      `git 追跡パスへの書込み拒否: ${logicalPath} は ${offender}（git: ignore / L2）に一致 — gitignore 側へ書くこと`
    );
  }
}

export type AccessOperation = "read" | "write" | "export";

export interface AccessCheckResult {
  allowed: boolean;
  reason: string;
  resourceLevel?: ClassificationLevel;
}

export function checkAgentAccess(
  registry: ClassificationRegistry,
  agent: AgentId,
  resourcePath: string,
  operation: AccessOperation
): AccessCheckResult {
  const resource = findResourceByPath(registry, resourcePath);
  if (!resource) {
    return { allowed: false, reason: `未登録リソース: ${resourcePath}` };
  }

  const agentMax =
    operation === "export" || operation === "write"
      ? getAgentOutputMaxLevel(registry, agent)
      : getAgentMaxLevel(registry, agent);
  if (!levelAtMost(resource.level, agentMax)) {
    return {
      allowed: false,
      reason: `${agent} の max_level ${agentMax} では ${resource.level} リソース ${resource.id} にアクセス不可`,
      resourceLevel: resource.level,
    };
  }

  if (operation === "export") {
    const levelDef = registry.levels[resource.level];
    if (levelDef?.export_allowed === false) {
      return {
        allowed: false,
        reason: `${resource.id} は export 不可（${resource.level}）`,
        resourceLevel: resource.level,
      };
    }
  }

  const allowedAgents =
    operation === "write" ? resource.write_agents : resource.read_agents;
  if (allowedAgents.length > 0 && !allowedAgents.includes(agent)) {
    return {
      allowed: false,
      reason: `${agent} は ${resource.id} の ${operation} 権限なし`,
      resourceLevel: resource.level,
    };
  }

  return { allowed: true, reason: "ok", resourceLevel: resource.level };
}

export interface ClassificationIssue {
  severity: "error" | "warning";
  message: string;
}

export function validateGitignoreCoverage(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const registry = loadClassificationRegistry();
  const gitignorePath = join(ROOT_DIR, ".gitignore");
  const gitignoreContent = readFileSync(gitignorePath, "utf-8");

  for (const resource of registry.resources) {
    if (resource.git !== "ignore") continue;
    // Strip a leading "**/" (global glob) before deriving the literal prefix so
    // patterns like "**/records/**" reduce to a meaningful "records" needle.
    const cleaned = resource.path.replace(/^\*\*\//, "");
    const bare = cleaned.split("*")[0]?.replace(/\/$/, "") ?? cleaned;
    const tenantGlob = `tenants/*/${resource.path}`;
    const tenantBare = `tenants/*/${bare}`;
    const covered =
      (bare.length > 0 && gitignoreContent.includes(bare)) ||
      gitignoreContent.includes(resource.path) ||
      gitignoreContent.includes(tenantGlob) ||
      gitignoreContent.includes(tenantBare);
    if (!covered) {
      issues.push({
        severity: "error",
        message: `L2/個情リソース ${resource.id} (${resource.path}) が .gitignore に未登録 — Git 漏洩リスク`,
      });
    }
  }

  return issues;
}

export function validateBankAccountLinksSync(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const bankAccounts = loadBankAccounts();
  const cashPath = join(getDataDir(), "finance", "cash-balance.yaml");
  if (!existsSync(cashPath)) return issues;

  const cash = readYamlFile(cashPath, cashBalanceSchema);
  const bankIds = new Set(bankAccounts?.accounts.map((a) => a.id) ?? []);

  for (const acct of cash.accounts) {
    if (acct.bank_account_id && bankIds.size > 0 && !bankIds.has(acct.bank_account_id)) {
      issues.push({
        severity: "warning",
        message: `cash-balance の ${acct.bank_account_id} が bank-accounts.yaml に未定義`,
      });
    }
    if (acct.bank_account_id && !bankAccounts) {
      issues.push({
        severity: "warning",
        message: `cash-balance が ${acct.bank_account_id} を参照するが bank-accounts.yaml が未作成`,
      });
    }
  }

  return issues;
}

/**
 * Reduce a registry resource path glob to a literal "needle" usable for
 * substring matching against ignore files. `**​/records/**` → `records`.
 */
export function boundaryNeedle(resourcePath: string): string {
  const withoutGlobalGlob = resourcePath.replace(/^\*\*\//, "");
  return (withoutGlobalGlob.split("*")[0] ?? withoutGlobalGlob).replace(/\/$/, "");
}

export interface BoundaryPattern {
  id: string;
  path: string;
  needle: string;
  level: ClassificationLevel;
}

/**
 * Resources that must be kept out of AI context/index: ai_context=blocked or an
 * explicit cursorignore flag. This is the single registry-driven source for the
 * `.cursorignore` / `.cursorindexingignore` boundaries.
 */
export function aiBoundaryPatterns(registry: ClassificationRegistry): BoundaryPattern[] {
  return registry.resources
    .filter((r) => r.ai_context === "blocked" || r.cursorignore)
    .map((r) => ({ id: r.id, path: r.path, needle: boundaryNeedle(r.path), level: r.level }));
}

function validateBoundaryFile(fileName: string): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const registry = loadClassificationRegistry();
  const filePath = join(ROOT_DIR, fileName);
  if (!existsSync(filePath)) {
    issues.push({
      severity: "warning",
      message: `${fileName} が未作成 — ai_context:blocked リソースが AI に載る可能性`,
    });
    return issues;
  }
  const content = readFileSync(filePath, "utf-8");
  for (const pattern of aiBoundaryPatterns(registry)) {
    if (!pattern.needle) continue;
    if (!content.includes(pattern.needle)) {
      issues.push({
        severity: "warning",
        message: `${pattern.id} (${pattern.path}) が ${fileName} に未登録の可能性`,
      });
    }
  }
  return issues;
}

export function validateCursorignoreCoverage(): ClassificationIssue[] {
  return validateBoundaryFile(".cursorignore");
}

export function validateCursorindexingignoreCoverage(): ClassificationIssue[] {
  return validateBoundaryFile(".cursorindexingignore");
}

export function runClassificationChecks(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  issues.push(...validateGitignoreCoverage());
  issues.push(...validateCursorignoreCoverage());
  issues.push(...validateCursorindexingignoreCoverage());
  issues.push(...validateBankAccountLinksSync());

  try {
    loadClassificationRegistry();
  } catch (e) {
    issues.push({
      severity: "error",
      message: `classification-registry.yaml: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  if (existsSync(getBankAccountsYaml())) {
    try {
      loadBankAccounts();
    } catch (e) {
      issues.push({
        severity: "error",
        message: `bank-accounts.yaml: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return issues;
}
