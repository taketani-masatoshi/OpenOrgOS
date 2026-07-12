import { readFileSync } from "node:fs";
import YAML from "yaml";
import { z } from "zod";
import { ROOT_DIR } from "../tenant.js";

const agentDelegationScopesSchema = z.object({
  version: z.string(),
  agents: z.record(z.string(), z.array(z.string().min(1))),
});

const SCOPES_PATH = `${ROOT_DIR}/steward/platform/protocol/agent-delegation-scopes.yaml`;

let cachedScopes: z.output<typeof agentDelegationScopesSchema> | undefined;

function loadAgentDelegationScopes() {
  if (cachedScopes) return cachedScopes;
  cachedScopes = agentDelegationScopesSchema.parse(YAML.parse(readFileSync(SCOPES_PATH, "utf-8")));
  return cachedScopes;
}

export function clearAgentDelegationScopesCacheForTests(): void {
  cachedScopes = undefined;
}

export function scopesForAgent(agentId: string): string[] {
  const doc = loadAgentDelegationScopes();
  const scopes = doc.agents[agentId];
  if (scopes?.length) return scopes;
  return [`agent.${agentId}`];
}

export function listAgentDelegationScopeIds(): string[] {
  return Object.keys(loadAgentDelegationScopes().agents);
}
