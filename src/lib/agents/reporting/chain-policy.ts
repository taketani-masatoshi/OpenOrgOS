import { join } from "node:path";
import type { AgentId } from "../../../../schemas/classification.js";
import { chainPolicySchema, type ChainPolicy } from "../../../../schemas/agent-reporting.js";
import { getCatalogAgent } from "../../agent-catalog.js";
import { STEWARD_AGENTS_DIR } from "../../steward-paths.js";
import { loadRegistryFile } from "../../utils.js";

export function loadChainPolicy(): ChainPolicy {
  return loadRegistryFile(
    join(STEWARD_AGENTS_DIR, "..", "reporting", "chain-policy.yaml"),
    chainPolicySchema,
    () =>
      chainPolicySchema.parse({
        version: "1.0",
        hub_agent: "coo",
        executive_agent: "executive_steward",
        excluded_from_field: ["executive_steward", "coo"],
        auto_forward_pulse: true,
        auto_forward_work_order_complete: true,
      })
  );
}

export function isFieldAgent(agentId: AgentId): boolean {
  const policy = loadChainPolicy();
  if (policy.excluded_from_field.includes(agentId)) return false;
  const agent = getCatalogAgent(agentId);
  if (!agent || agent.status === "planned") return false;
  if (agent.class === "advisor") return false;
  if (!agent.dispatch_modes.includes("implement")) return false;
  return true;
}

export function canReceiveImplementOrder(agentId: AgentId): boolean {
  return isFieldAgent(agentId);
}
