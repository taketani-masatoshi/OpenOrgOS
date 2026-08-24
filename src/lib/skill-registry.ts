import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { agentId } from "../../schemas/classification.js";
import { operatorPermissionSchema } from "../../schemas/org/operator.js";
import { CORE_SKILL_REGISTRY_PATH, STEWARD_SKILLS_DIR } from "./steward-paths.js";
import {
  getModuleRootDir,
  listCatalogModuleIds,
  listTenantScopeCatalogModuleIds,
  loadEnabledModules,
} from "./modules.js";
import { loadRegistryFile } from "./utils.js";

export const skillChatArgSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["month", "string", "number", "id", "boolean"]).default("string"),
  required: z.boolean().default(false),
});

export const skillChatSchema = z.object({
  enabled: z.boolean().default(false),
  kind: z.enum(["read", "write", "approval"]),
  permission: operatorPermissionSchema,
  label: z.string().min(1),
  args: z.array(skillChatArgSchema).optional(),
  /** Optional keywords for catalog search / integrity; routing registry remains primary match. */
  keywords: z.array(z.string().min(1)).optional(),
});

const skillRegistrySchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      runtime: z.enum(["cli", "cursor-only", "agent"]),
      cli_command: z.string().optional(),
      handler: z.string().optional(),
      argv: z.array(z.string().min(1)).min(1).optional(),
      required_options: z.array(z.string().min(1)).optional(),
      deferred: z.string().min(1).optional(),
      agent_id: agentId,
      description: z.string(),
      chat: skillChatSchema.optional(),
    })
  ),
});

export type SkillChatArg = z.infer<typeof skillChatArgSchema>;
export type SkillChatConfig = z.infer<typeof skillChatSchema>;
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

interface SkillRegistryCache {
  skills: ResolvedSkillEntry[];
  byId: Map<string, ResolvedSkillEntry>;
  byCliCommand: Map<string, ResolvedSkillEntry>;
}

const registryCache = new Map<boolean, SkillRegistryCache>();

/** Test / hot-reload hook — clears memoized registry indexes. */
export function clearSkillRegistryCache(): void {
  registryCache.clear();
}

function buildRegistryCache(scopeToTenant: boolean): SkillRegistryCache {
  const byId = new Map<string, ResolvedSkillEntry>();
  for (const skill of loadCoreSkills()) byId.set(skill.id, skill);
  for (const skill of resolveModuleSkillRegistries(scopeToTenant)) byId.set(skill.id, skill);

  const byCliCommand = new Map<string, ResolvedSkillEntry>();
  for (const skill of byId.values()) {
    if (skill.cli_command) byCliCommand.set(skill.cli_command, skill);
  }

  return { skills: [...byId.values()], byId, byCliCommand };
}

function getRegistryCache(scopeToTenant = false): SkillRegistryCache {
  const cached = registryCache.get(scopeToTenant);
  if (cached) return cached;
  const built = buildRegistryCache(scopeToTenant);
  registryCache.set(scopeToTenant, built);
  return built;
}

export function loadSkillRegistry(scopeToTenant = false): ResolvedSkillEntry[] {
  return getRegistryCache(scopeToTenant).skills;
}

export function getSkillById(id: string, scopeToTenant = false): ResolvedSkillEntry | undefined {
  return getRegistryCache(scopeToTenant).byId.get(id);
}

export function getSkillByCliCommand(
  cliCommand: string,
  scopeToTenant = false
): ResolvedSkillEntry | undefined {
  return getRegistryCache(scopeToTenant).byCliCommand.get(cliCommand);
}

export function getCliSkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return loadSkillRegistry(scopeToTenant).filter((s) => s.runtime === "cli");
}

export function getAgentInteractiveSkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return loadSkillRegistry(scopeToTenant).filter((s) => s.runtime === "cursor-only" || s.runtime === "agent");
}

/** Skills exposed to Steward Chat command router (`chat.enabled: true`). */
export function getChatEnabledSkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return loadSkillRegistry(scopeToTenant).filter(
    (s) => s.runtime === "cli" && s.chat?.enabled === true
  );
}

/** @deprecated use getAgentInteractiveSkills — cursor-only is legacy alias for agent runtime */
export function getCursorOnlySkills(scopeToTenant = false): ResolvedSkillEntry[] {
  return getAgentInteractiveSkills(scopeToTenant);
}

export function resolveSkillFilePath(skill: ResolvedSkillEntry): string {
  return join(skill.skillDir, skill.file);
}

export function validateSkillRegistryLegacyAgentFields(): string[] {
  const issues: string[] = [];
  const paths = [CORE_SKILL_REGISTRY_PATH];
  for (const moduleId of listCatalogModuleIds()) {
    const registryPath = join(getModuleRootDir(moduleId), "skills", "registry.yaml");
    if (existsSync(registryPath)) paths.push(registryPath);
  }

  for (const path of paths) {
    const doc = YAML.parse(readFileSync(path, "utf-8")) as { skills?: Array<Record<string, unknown>> };
    for (const skill of doc.skills ?? []) {
      if ("agent" in skill && !("agent_id" in skill)) {
        issues.push(`${path}: skill ${String(skill.id)} uses deprecated agent field — use agent_id`);
      }
      if ("agent" in skill && "agent_id" in skill) {
        issues.push(`${path}: skill ${String(skill.id)} must not declare both agent and agent_id`);
      }
    }
  }
  return issues;
}

export function validateSkillRegistryFiles(scopeToTenant = false): string[] {
  const issues: string[] = [...validateSkillRegistryLegacyAgentFields()];
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
    if (skill.runtime === "cli") {
      const classifications = [skill.handler, skill.argv, skill.deferred].filter(Boolean);
      if (classifications.length === 0) {
        issues.push(`${skill.id}: cli runtime is unwired; set handler, argv, or deferred`);
      } else if (classifications.length > 1) {
        issues.push(`${skill.id}: set exactly one of handler, argv, or deferred`);
      }
      if (skill.argv && skill.cli_command !== skill.argv.join(" ")) {
        issues.push(`${skill.id}: cli_command must match argv`);
      }
      if (skill.handler && skill.handler !== skill.id) {
        issues.push(`${skill.id}: handler must use the canonical skill id`);
      }
      if (skill.required_options?.length && !skill.handler) {
        issues.push(`${skill.id}: required_options requires a typed handler`);
      }
    } else if (skill.handler || skill.argv || skill.required_options || skill.deferred) {
      issues.push(`${skill.id}: agent runtime must not declare CLI invocation metadata`);
    }
  }
  return issues;
}

export function skillRegistryDir(): string {
  return STEWARD_SKILLS_DIR;
}
