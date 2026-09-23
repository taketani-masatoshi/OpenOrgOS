import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../../../schemas/classification.js";
import type { ResolvedSkillEntry } from "../../skill-registry.js";
import { ROOT_DIR } from "../../tenant.js";
import { agentDefinitionRelPath } from "../definition.js";
import { listCatalogAgents } from "../../agent-catalog.js";

export const AGENT_EXPORTS_DIR = join(ROOT_DIR, "steward", "platform", "agent", "exports");

export type AgentToolFormat = "portable" | "cursor" | "path";

export interface AgentRegistryEntry {
  id: string;
  name: string;
  name_ja?: string;
  path: string;
  tier?: string;
  scope?: string;
}

export function loadAgentRegistryEntries(): AgentRegistryEntry[] {
  return listCatalogAgents();
}

/** Repo-relative prompt path (same source as `agentDefinitionRelPath`). */
export function agentPromptPath(agent: AgentId): string {
  return agentDefinitionRelPath(agent);
}

export function formatAgentPromptRef(agent: AgentId, format: AgentToolFormat = "portable"): string {
  const path = agentPromptPath(agent);
  switch (format) {
    case "cursor":
      return `@${path}`;
    case "path":
      return path;
    default:
      return [
        `**Agent definition:** \`${path}\``,
        `- Cursor: \`@${path}\``,
        `- Claude / ChatGPT / Cline / Aider: ファイルを添付、または \`orgos operator export --agent ${agent}\``,
      ].join("\n");
  }
}

export function formatSkillReference(skill: ResolvedSkillEntry, format: AgentToolFormat = "portable"): string {
  const rel = `${skill.skillDirRel}/${skill.file}`;
  switch (format) {
    case "cursor":
      return `@${rel}`;
    case "path":
      return rel;
    default:
      return [
        `**Skill:** \`${rel}\``,
        `- Cursor: \`@${rel}\``,
        `- その他 LLM: 上記 Path を添付`,
      ].join("\n");
  }
}

export function isAgentInteractiveSkill(skill: ResolvedSkillEntry): boolean {
  return skill.runtime === "cursor-only" || skill.runtime === "agent";
}

/**
 * Portable-export reader — returns a placeholder when missing.
 * Distinct from capability `readAgentDefinition` (empty string).
 */
export function readAgentDefinition(agent: AgentId): string {
  const rel = agentPromptPath(agent);
  const abs = join(ROOT_DIR, rel);
  if (!existsSync(abs)) {
    return `(Agent definition not found: ${rel})`;
  }
  return readFileSync(abs, "utf-8");
}
