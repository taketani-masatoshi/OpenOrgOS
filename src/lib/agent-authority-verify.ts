/**
 * Delegation scopes and control framework agent references vs catalog.
 */

import { readFileSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { resolveAgentId } from "./agent-catalog.js";
import { loadControlMaps } from "./control-framework.js";
import { ROOT_DIR } from "./tenant.js";

const SCOPES_PATH = `${ROOT_DIR}/steward/platform/protocol/agent-delegation-scopes.yaml`;

const agentDelegationScopesSchema = z.object({
  version: z.string(),
  agents: z.record(z.string(), z.array(z.string().min(1))),
});

export function validateDelegationScopeAgents(): string[] {
  const issues: string[] = [];
  const doc = agentDelegationScopesSchema.parse(YAML.parse(readFileSync(SCOPES_PATH, "utf-8")));

  for (const agentId of Object.keys(doc.agents)) {
    if (!resolveAgentId(agentId)) {
      issues.push(`delegation-scopes: unknown agent ${agentId}`);
    }
  }
  return issues;
}

export function validateControlFrameworkAgents(): string[] {
  const issues: string[] = [];
  for (const ctrl of loadControlMaps()) {
    if (ctrl.primary_agent && !resolveAgentId(ctrl.primary_agent)) {
      issues.push(`control ${ctrl.id}: unknown primary_agent ${ctrl.primary_agent}`);
    }
    for (const secondary of ctrl.secondary_agents ?? []) {
      if (!resolveAgentId(secondary)) {
        issues.push(`control ${ctrl.id}: unknown secondary_agent ${secondary}`);
      }
    }
  }
  return issues;
}

export function validateAuthorityExternalKeys(): string[] {
  return [...validateDelegationScopeAgents(), ...validateControlFrameworkAgents()];
}
