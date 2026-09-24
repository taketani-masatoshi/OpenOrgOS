/**
 * Single source for agent definition markdown relative paths and existence checks.
 * Public wrappers keep their historical return shapes (relative vs absolute).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../../schemas/classification.js";
import { getInstallRoot } from "../orgos-paths.js";
import { getCatalogAgent, resolveAgentId } from "./catalog.js";

/** Repo-relative path to the agent definition markdown. */
export function agentDefinitionRelPath(agentId: AgentId | string): string {
  const resolved = resolveAgentId(String(agentId)) ?? String(agentId);
  return getCatalogAgent(resolved)?.path ?? `steward/core/agents/${resolved}_agent.md`;
}

/**
 * True when the agent definition markdown exists on disk.
 * Always resolves against install root (cwd-independent).
 */
export function agentDefinitionExists(agentId: AgentId | string): boolean {
  return existsSync(join(getInstallRoot(), agentDefinitionRelPath(agentId)));
}
