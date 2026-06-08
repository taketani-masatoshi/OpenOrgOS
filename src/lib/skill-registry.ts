import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ROOT_DIR } from "./tenant.js";
import { readYamlFile } from "./utils.js";

const skillRegistrySchema = z.object({
  skills: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      runtime: z.enum(["cli", "cursor-only"]),
      cli_command: z.string().optional(),
      agent: z.string(),
      description: z.string(),
    })
  ),
});

export type SkillRegistryEntry = z.infer<typeof skillRegistrySchema>["skills"][number];

const REGISTRY_PATH = join(ROOT_DIR, "steward", "skills", "registry.yaml");

export function loadSkillRegistry(): SkillRegistryEntry[] {
  if (!existsSync(REGISTRY_PATH)) return [];
  return readYamlFile(REGISTRY_PATH, skillRegistrySchema).skills;
}

export function getCliSkills(): SkillRegistryEntry[] {
  return loadSkillRegistry().filter((s) => s.runtime === "cli");
}

export function getCursorOnlySkills(): SkillRegistryEntry[] {
  return loadSkillRegistry().filter((s) => s.runtime === "cursor-only");
}

export function validateSkillRegistryFiles(): string[] {
  const issues: string[] = [];
  const dir = join(ROOT_DIR, "steward", "skills");
  for (const skill of loadSkillRegistry()) {
    const path = join(dir, skill.file);
    if (!existsSync(path)) {
      issues.push(`missing skill file: steward/skills/${skill.file} (${skill.id})`);
    }
    if (skill.runtime === "cli" && !skill.cli_command) {
      issues.push(`${skill.id}: cli runtime requires cli_command`);
    }
  }
  return issues;
}
