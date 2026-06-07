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
import { cashBalanceSchema } from "../../schemas/finance.js";
import {
  ROOT_DIR,
  DATA_DIR,
  readYamlFile,
  BANK_ACCOUNTS_YAML,
  CLASSIFICATION_REGISTRY_YAML,
} from "./utils.js";

const LEVEL_ORDER: Record<ClassificationLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export function loadClassificationRegistry(): ClassificationRegistry {
  return readYamlFile(CLASSIFICATION_REGISTRY_YAML, classificationRegistrySchema);
}

export function loadBankAccounts(): BankAccountsFile | undefined {
  if (!existsSync(BANK_ACCOUNTS_YAML)) return undefined;
  return readYamlFile(BANK_ACCOUNTS_YAML, bankAccountsFileSchema);
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
    if (levelDef.export_allowed === false) {
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
    const bare = resource.path.split("*")[0]?.replace(/\/$/, "") ?? resource.path;
    if (!gitignoreContent.includes(bare) && !gitignoreContent.includes(resource.path)) {
      issues.push({
        severity: "warning",
        message: `L2 リソース ${resource.id} (${resource.path}) が .gitignore に未登録の可能性`,
      });
    }
  }

  return issues;
}

export function validateBankAccountLinksSync(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const bankAccounts = loadBankAccounts();
  const cashPath = join(DATA_DIR, "finance", "cash-balance.yaml");
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

export function validateCursorignoreCoverage(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  const registry = loadClassificationRegistry();
  const cursorignorePath = join(ROOT_DIR, ".cursorignore");
  if (!existsSync(cursorignorePath)) {
    issues.push({
      severity: "warning",
      message: ".cursorignore が未作成 — ai_context:blocked リソースが AI 自動コンテキストに載る可能性",
    });
    return issues;
  }
  const content = readFileSync(cursorignorePath, "utf-8");

  for (const resource of registry.resources) {
    if (resource.ai_context !== "blocked" && !resource.cursorignore) continue;
    const needle = resource.path.replace(/\*\*/g, "").replace(/\*/g, "");
    if (needle && !content.includes("records") && resource.path.includes("records")) {
      issues.push({
        severity: "warning",
        message: `${resource.id} (${resource.path}) が .cursorignore に未登録の可能性`,
      });
    } else if (needle && !content.includes(needle.split("/")[0] ?? needle)) {
      const bare = resource.path.split("*")[0]?.replace(/\/$/, "") ?? "";
      if (bare && !content.includes(bare)) {
        issues.push({
          severity: "warning",
          message: `${resource.id} (${resource.path}) が .cursorignore に未登録の可能性`,
        });
      }
    }
  }

  return issues;
}

export function runClassificationChecks(): ClassificationIssue[] {
  const issues: ClassificationIssue[] = [];
  issues.push(...validateGitignoreCoverage());
  issues.push(...validateCursorignoreCoverage());
  issues.push(...validateBankAccountLinksSync());

  try {
    loadClassificationRegistry();
  } catch (e) {
    issues.push({
      severity: "error",
      message: `classification-registry.yaml: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  if (existsSync(BANK_ACCOUNTS_YAML)) {
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
