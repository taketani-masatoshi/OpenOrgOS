/**
 * Module trust policy — Phase 1 (Internal) enforcement.
 * Canonical: docs/org-os/adr/ADR-001-module-execution-trust-boundary.md
 */

import { isProdSecurityMode } from "./console-auth/operator-rbac.js";
import { existsSync, readFileSync } from "node:fs";
import { modulesFilePath } from "./modules.js";
import YAML from "yaml";

/** Marketplace / third-party execution phases (ADR-001). */
export const MODULE_TRUST_TIERS = [
  "internal",
  "invited",
  "reviewed",
  "managed",
] as const;

export type ModuleTrustTier = (typeof MODULE_TRUST_TIERS)[number];

/** Fields that imply Marketplace / dynamic install — blocked until Phase 3+. */
const MARKETPLACE_MODULE_FIELDS = [
  "trust_tier",
  "artifact_url",
  "artifact_digest",
  "publisher_id",
  "marketplace_listing_id",
  "signature",
  "sbom_url",
] as const;

export interface ModuleTrustPolicyIssue {
  file: string;
  message: string;
}

/** Whether third-party module execution is explicitly enabled (dev experiments only). */
export function isThirdPartyModuleExecutionAllowed(): boolean {
  return process.env.ORGOS_ALLOW_THIRD_PARTY_MODULES === "1";
}

/** Highest trust tier allowed to run without isolated runtime (ADR-001). */
export function maxTrustTierWithoutSandbox(): ModuleTrustTier {
  if (isThirdPartyModuleExecutionAllowed()) return "invited";
  return "internal";
}

function isMarketplaceFieldKey(key: string): boolean {
  return (MARKETPLACE_MODULE_FIELDS as readonly string[]).includes(key);
}

function scanRawModuleEntry(raw: unknown, moduleIndex: number): ModuleTrustPolicyIssue[] {
  const issues: ModuleTrustPolicyIssue[] = [];
  if (!raw || typeof raw !== "object") return issues;

  const entry = raw as Record<string, unknown>;
  const moduleId = typeof entry.id === "string" ? entry.id : `modules[${moduleIndex}]`;

  for (const key of Object.keys(entry)) {
    if (!isMarketplaceFieldKey(key)) continue;
    const value = entry[key];
    if (value === undefined || value === null) continue;

    if (key === "trust_tier") {
      const tier = String(value).trim() as ModuleTrustTier;
      if (tier !== "internal" && !isThirdPartyModuleExecutionAllowed()) {
        issues.push({
          file: "modules.yaml",
          message:
            `module "${moduleId}" trust_tier "${tier}" is blocked — ` +
            `only "internal" is allowed until Module Runtime + Gateway ship (ADR-001). ` +
            `Set ORGOS_ALLOW_THIRD_PARTY_MODULES=1 for local experiments only.`,
        });
      }
      continue;
    }

    issues.push({
      file: "modules.yaml",
      message:
        `module "${moduleId}" field "${key}" is not supported — ` +
        `Marketplace install fields are blocked until Phase 3 (ADR-001).`,
    });
  }

  return issues;
}

/**
 * Validate tenant modules.yaml against Phase 1 trust policy.
 * Detects Marketplace-oriented fields before unsafe runtime exists.
 */
export function runModuleTrustPolicyChecks(): ModuleTrustPolicyIssue[] {
  const issues: ModuleTrustPolicyIssue[] = [];

  if (isThirdPartyModuleExecutionAllowed() && isProdSecurityMode()) {
    issues.push({
      file: "env",
      message:
        "ORGOS_ALLOW_THIRD_PARTY_MODULES=1 is forbidden in production — third-party module execution is not ready",
    });
  }

  let rawModules: unknown[] = [];
  const path = modulesFilePath();
  if (!existsSync(path)) return issues;

  try {
    const parsed = YAML.parse(readFileSync(path, "utf-8")) as { modules?: unknown[] };
    rawModules = Array.isArray(parsed?.modules) ? parsed.modules : [];
  } catch (err) {
    issues.push({
      file: "modules.yaml",
      message: err instanceof Error ? err.message : "modules.yaml parse failed",
    });
    return issues;
  }

  for (let i = 0; i < rawModules.length; i++) {
    issues.push(...scanRawModuleEntry(rawModules[i], i));
  }

  return issues;
}

/** Human-readable policy summary for doctor / validate output. */
export function moduleTrustPolicySummary(): string {
  const thirdParty = isThirdPartyModuleExecutionAllowed();
  const maxTier = maxTrustTierWithoutSandbox();
  return [
    `module_trust_policy: phase_1_internal`,
    `third_party_execution: ${thirdParty ? "experimental" : "blocked"}`,
    `max_trust_tier_without_sandbox: ${maxTier}`,
    `module_runtime: static_bundle (same process as Core — not marketplace-safe)`,
  ].join("\n");
}
