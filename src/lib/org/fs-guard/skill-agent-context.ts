import { loadModuleManifest } from "../../modules.js";
import { getSkillById, loadSkillRegistry, type ResolvedSkillEntry } from "../../skill-registry.js";

export function resolveSkillFsGuardAgent(skill: ResolvedSkillEntry | undefined): string | undefined {
  if (skill?.agent_id) return skill.agent_id;
  if (skill?.moduleId && loadModuleManifest(skill.moduleId)) return skill.moduleId;
  return undefined;
}

export function listSkillsMissingFsGuardAgent(): string[] {
  const missing: string[] = [];
  for (const skill of loadSkillRegistry(true)) {
    if (skill.runtime !== "cli") continue;
    if (resolveSkillFsGuardAgent(skill)) continue;
    missing.push(skill.id);
  }
  return missing;
}

export function resolveSkillFsGuardAgentById(skillId: string): string | undefined {
  return resolveSkillFsGuardAgent(getSkillById(skillId));
}
