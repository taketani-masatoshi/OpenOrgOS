import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stakeholdersFileSchema, type Stakeholder } from "../../schemas/executive.js";
import { getStakeholdersDocsDir, getStakeholdersYaml, readYamlFile, resolveTenantPath } from "./utils.js";

export function stakeholdersFileExists(): boolean {
  return existsSync(getStakeholdersYaml());
}

export function loadStakeholders() {
  if (!stakeholdersFileExists()) {
    throw new Error(
      `Stakeholders registry missing: ${getStakeholdersYaml()}. ` +
        "Run: cp data/executive/stakeholders.yaml.example data/executive/stakeholders.yaml"
    );
  }
  return readYamlFile(getStakeholdersYaml(), stakeholdersFileSchema);
}

export function loadStakeholdersIfExists() {
  if (!stakeholdersFileExists()) return null;
  return loadStakeholders();
}

export function getStakeholderById(id: string): Stakeholder | undefined {
  const file = loadStakeholdersIfExists();
  return file?.stakeholders.find((s) => s.id === id);
}

export function resolveStakeholderProfilePath(stakeholder: Stakeholder): string | null {
  if (!stakeholder.profile_md) return null;
  const abs = resolveTenantPath(stakeholder.profile_md);
  return existsSync(abs) ? abs : null;
}

export function readStakeholderProfile(stakeholder: Stakeholder): string | null {
  const path = resolveStakeholderProfilePath(stakeholder);
  if (!path) return null;
  return readFileSync(path, "utf-8");
}

export function listStakeholderProfileDir(): string {
  return getStakeholdersDocsDir();
}
