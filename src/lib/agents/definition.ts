/**
 * Single source for agent definition markdown relative paths.
 * Public wrappers keep their historical return shapes (relative vs absolute).
 */

import type { AgentId } from "../../../schemas/classification.js";
import { getCatalogAgent, resolveAgentId } from "./catalog.js";

/** Repo-relative path to the agent definition markdown. */
export function agentDefinitionRelPath(agentId: AgentId | string): string {
  const resolved = resolveAgentId(String(agentId)) ?? String(agentId);
  return getCatalogAgent(resolved)?.path ?? `steward/core/agents/${resolved}_agent.md`;
}
