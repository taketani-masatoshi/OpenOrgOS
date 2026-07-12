/**
 * Agent activation (catalog definition + tenant roster).
 * Keeps roster coupling out of pure catalog loaders where possible.
 */

import type { AgentId } from "../../schemas/classification.js";
import type { AgentDispatchMode } from "../../schemas/agent-catalog.js";
import { getCatalogAgent, resolveAgentId } from "./agent-catalog.js";
import { readTenantAgentRosterState } from "./tenant-roster-load.js";

export type AgentActivationProfile = "operational" | "developer" | "task";

/**
 * Runtime activation: catalog constraints + tenant roster.
 * Prefer this (or re-exports from agent-roster) over importing roster into catalog code.
 */
export function isAgentActive(
  id: AgentId,
  options: { profile?: AgentActivationProfile; mode?: AgentDispatchMode } = {}
): boolean {
  const resolved = resolveAgentId(id);
  const agent = resolved ? getCatalogAgent(resolved) : undefined;
  if (!agent || agent.status === "planned") return false;
  if (options.mode && !agent.dispatch_modes.includes(options.mode)) return false;

  const profile = options.profile ?? "operational";
  const { exists, roster } = readTenantAgentRosterState();
  if (exists && roster.disabled.includes(resolved!)) return false;

  if (profile === "task") {
    if (exists && (roster.profiles.task?.length ?? 0) > 0) {
      return (
        roster.profiles.task.includes(resolved!) &&
        isAgentActive(resolved!, { profile: "operational", mode: options.mode })
      );
    }
    return isAgentActive(resolved!, { profile: "operational", mode: options.mode });
  }

  if (agent.activation === "developer_explicit") {
    return profile === "developer" && exists && roster.profiles.developer.includes(resolved!);
  }
  if (agent.activation === "tenant") {
    return roster.profiles.operational.includes(resolved!);
  }
  if (agent.activation === "always") {
    return true;
  }
  return false;
}
