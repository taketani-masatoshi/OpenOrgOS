import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CORE_SKILL_REGISTRY_PATH, STEWARD_SKILLS_DIR } from "./steward-paths.js";
import {
  getModuleRootDir,
  listCatalogModuleIds,
  listTenantScopeCatalogModuleIds,
  loadEnabledModules,
} from "./modules.js";
import { loadRegistryFile } from "./utils.js";

const skillRegistrySchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      runtime: z.enum(["cli", "cursor-only", "agent"]),
      cli_command: z.string().optional(),
      agent: z.string(),
      description: z.string(),
    })
  ),
});

export type SkillRegistryEntry = z.infer<typeof skillRegistrySchema>["skills"][number];

export interface ResolvedSkillEntry extends SkillRegistryEntry {
  skillDir: string;
  skillDirRel: string;
  moduleId?: string;
}

function normalizeSkillRuntime(runtime: SkillRegistryEntry["runtime"]): SkillRegistryEntry["runtime"] {
  return runtime === "cursor-only" ? "agent" : runtime;
}

function loadRegistryAt(path: string): SkillRegistryEntry[] {
  return loadRegistryFile(path, skillRegistrySchema, () => ({ skills: [] })).skills.map((skill) => ({
    ...skill,
    runtime: normalizeSkillRuntime(skill.runtime),
  }));
}

function moduleSkillDirRel(moduleRoot: string, moduleId: string): string {
  const idx = moduleRoot.indexOf("steward/");
  const base = idx >= 0 ? moduleRoot.slice(idx) : `steward/modules/${moduleId}`;
  return `${base.replace(/\\/g, "/")}/skills`;
}

function resolveModuleSkillRegistries(scopeToTenant: boolean): ResolvedSkillEntry[] {
  const catalogIds = scopeToTenant ? listTenantScopeCatalogModuleIds() : listCatalogModuleIds();
  const enabledIds = new Set(loadEnabledModules().map((m) => m.agent));
  const out: ResolvedSkillEntry[] = [];

  for (const moduleId of catalogIds) {
    if (scopeToTenant && !enabledIds.has(moduleId as never)) continue;

    const moduleRoot = getModuleRootDir(moduleId);
    const skillDir = join(moduleRoot, "skills");
    const registryPath = join(skillDir, "registry.yaml");
    if (!existsSync(registryPath)) continue;

    const skillDirRel = moduleSkillDirRel(moduleRoot, moduleId);
    for (const skill of loadRegistryAt(registryPath)) {
      out.push({ ...skill, skillDir, skillDirRel, moduleId });
    }
  }
  return out;
}

function loadCoreSkills(): ResolvedSkillEntry[] {
  return loadRegistryAt(CORE_SKILL_REGISTRY_PATH).map((skill) => ({
    ...skill,
    skillDir: STEWARD_SKILLS_DIR,
    skillDirRel: "steward/core/skills",
  }));
}

export function loadSkillRegistry(scopeToTenant = false): ResolvedSkillEntry[] {
  const byId = new Map<string, ResolvedSkillEntry>();
  for (const skill of loadCoreSkills()) byId.set(skill.id, skill);
  for (const skill of resolveModuleSkillRegistries(scopeToTenant)) byId.set(skill.id, skill);
  return [...byId.values()];
}

export function getSkillById(id: string, scopeToTenant = false): ResolvedSkillEntry | undefined {
  return loadSkillRegistry(scopeToTenant).find((s) => s.id === id);
}

export function getCliSkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return loadSkillRegistry(scopeToTenant).filter((s) => s.runtime === "cli");
}

export function getAgentInteractiveSkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return loadSkillRegistry(scopeToTenant).filter((s) => s.runtime === "cursor-only" || s.runtime === "agent");
}

/** @deprecated use getAgentInteractiveSkills — cursor-only is legacy alias for agent runtime */
export function getCursorOnlySkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return getAgentInteractiveSkills(scopeToTenant);
}

export function resolveSkillFilePath(skill: ResolvedSkillEntry): string {
  return join(skill.skillDir, skill.file);
}

export function validateSkillRegistryFiles(scopeToTenant = false): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  for (const skill of loadSkillRegistry(scopeToTenant)) {
    if (seen.has(skill.id)) issues.push(`duplicate skill id: ${skill.id}`);
    seen.add(skill.id);
    const path = resolveSkillFilePath(skill);
    if (!existsSync(path)) {
      issues.push(`missing skill file: ${skill.skillDirRel}/${skill.file} (${skill.id})`);
    }
    if (skill.runtime === "cli" && !skill.cli_command) {
      issues.push(`${skill.id}: cli runtime requires cli_command`);
    }
  }
  return issues;
}

export function skillRegistryDir(): string {
  return STEWARD_SKILLS_DIR;
}
