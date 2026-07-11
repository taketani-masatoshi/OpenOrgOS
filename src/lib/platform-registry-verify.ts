/**
 * Platform registry verification — catalog · routing · skills · capability drift.
 */

import { validateAgentCatalog } from "./agent-catalog.js";
import { validateAuthorityExternalKeys } from "./agent-authority-verify.js";
import { validateAgentDocsDrift } from "./agent-docs-sync.js";
import { validateCapabilityManifestDrift } from "./agent-capability-sync.js";
import { validateRoutingRegistry } from "./routing.js";
import { validateSkillDispatchReachability } from "./skill-dispatch-verify.js";
import { resolveRegisteredSkillInvocation } from "../commands/skills.js";
import { validateSkillRegistryFiles } from "./skill-registry.js";

export interface PlatformRegistryIssue {
  source:
    | "catalog"
    | "routing"
    | "skills"
    | "dispatch"
    | "capability"
    | "delegation"
    | "controls"
    | "docs";
  message: string;
}

export function verifyPlatformRegistry(): PlatformRegistryIssue[] {
  const issues: PlatformRegistryIssue[] = [];

  for (const message of validateAgentCatalog()) {
    issues.push({ source: "catalog", message });
  }
  for (const message of validateRoutingRegistry()) {
    issues.push({ source: "routing", message });
  }
  for (const message of validateSkillRegistryFiles()) {
    issues.push({ source: "skills", message });
  }
  for (const message of validateSkillDispatchReachability(resolveRegisteredSkillInvocation)) {
    issues.push({ source: "dispatch", message });
  }
  for (const message of validateCapabilityManifestDrift()) {
    issues.push({ source: "capability", message });
  }
  for (const message of validateAuthorityExternalKeys()) {
    if (message.startsWith("control ")) {
      issues.push({ source: "controls", message });
    } else {
      issues.push({ source: "delegation", message });
    }
  }
  for (const message of validateAgentDocsDrift()) {
    issues.push({ source: "docs", message });
  }

  return issues;
}

export function formatPlatformRegistryReport(issues: PlatformRegistryIssue[]): string {
  if (issues.length === 0) {
    return "Platform registry verify: OK (catalog · routing · skills · dispatch · capability)";
  }
  const lines = ["Platform registry verify: FAILED", ""];
  for (const issue of issues) {
    lines.push(`- [${issue.source}] ${issue.message}`);
  }
  return lines.join("\n");
}
