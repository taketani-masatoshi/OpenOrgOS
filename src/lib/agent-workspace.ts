import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { TenantModule } from "../../schemas/modules.js";
import { getAgentCapability } from "./agent-capability.js";
import { initTenantControlsFile } from "./control-framework.js";
import { MODULE_DEFAULT_DATA_ROOT } from "./module-business-data.js";
import {
  getModuleSeedDir,
  loadModuleManifest,
  loadModulesFile,
  MODULES_FILE,
} from "./modules.js";
import { loadTenantRegulationsFile } from "./regulations.js";
import { seedRegulationDocs } from "./regulations.js";
import { REGULATIONS_FILE } from "./regulations.js";
import { getTenantDir, getTenantTemplateDir } from "./tenant.js";
import { loadTenantStandards, STANDARDS_FILE } from "./tenant-standards.js";
import { resolveTenantPath, writeYamlFile } from "./utils.js";
import { scaffoldModuleExtensionDocs } from "./tenant-document-zones.js";
import { tenantRegulationsFileSchema } from "../../schemas/tenant-regulations.js";
import { tenantStandardsFileSchema } from "../../schemas/tenant-standards.js";

export interface WorkspaceInitResult {
  created: string[];
  skipped: string[];
}

const MODULE_AGENT: Record<string, AgentId> = {
  jp_medical_device: "medical_device_regulatory",
};

const MODULE_DEFAULTS: Record<string, Omit<TenantModule, "enabled">> = {
  jp_medical_device: {
    id: "jp_medical_device",
    agent: "jp_medical_device",
    data_root: "data/medical-device/",
    docs_root: "docs/medical-device/",
    summary_dir: "agent-summaries/medical-device-regulatory/",
    notes: "医療機器 QMS · GVP · 薬事台帳 · REG-025/026 · ISO 13485",
  },
  investor_relations: {
    id: "investor_relations",
    agent: "investor_relations",
    data_root: "data/investor-relations/",
    docs_root: "docs/investor-relations/",
    summary_dir: "agent-summaries/investor-relations/",
    notes: "自社 IR · cap table · 開示カレンダー",
  },
};

const MODULE_ISO: Record<string, string[]> = {
  jp_medical_device: ["ISO-13485"],
};

function normalizeDir(rel: string): string {
  return rel.endsWith("/") ? rel : `${rel}/`;
}

function seedReadmeForPath(absDir: string, rel: string): void {
  const templateReadme = join(getTenantTemplateDir(), rel.replace(/\/$/, ""), "00-README.md");
  const dest = join(absDir, "00-README.md");
  if (existsSync(dest)) return;
  if (existsSync(templateReadme)) {
    writeFileSync(dest, readFileSync(templateReadme, "utf-8"));
    return;
  }
  writeFileSync(dest, `# ${rel}\n\nOrgOS workspace — auto-init.\n`);
}

export function ensureAgentWorkspace(agentId: AgentId): WorkspaceInitResult {
  const cap = getAgentCapability(agentId);
  const created: string[] = [];
  const skipped: string[] = [];
  const paths = [...new Set([...(cap?.data_paths ?? []), ...(cap?.docs_paths ?? [])])];

  for (const rel of paths) {
    const normalized = normalizeDir(rel);
    const abs = resolveTenantPath(normalized.replace(/\/$/, ""));
    if (existsSync(abs)) {
      skipped.push(normalized);
      continue;
    }
    mkdirSync(abs, { recursive: true });
    seedReadmeForPath(abs, normalized);
    created.push(normalized);
  }

  return { created, skipped };
}

function copyActivationSeed(moduleId: string, seedFile: string, dataRootRel: string): boolean {
  const seedPath = join(getModuleSeedDir(moduleId), seedFile);
  if (!existsSync(seedPath)) return false;
  const targetName = seedFile.endsWith(".example")
    ? seedFile.slice(0, -".example".length)
    : seedFile;
  const dest = resolveTenantPath(join(dataRootRel.replace(/\/$/, ""), targetName));
  if (existsSync(dest)) return false;
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(seedPath, dest);
  return true;
}

function enableModuleInYaml(moduleId: string): TenantModule {
  const path = join(getTenantDir(), MODULES_FILE);
  const file = loadModulesFile();
  let mod = file.modules.find((m) => m.id === moduleId || m.agent === moduleId);
  const defaults = MODULE_DEFAULTS[moduleId];
  if (!mod) {
    if (!defaults) {
      throw new Error(`Unknown module "${moduleId}" — add entry to modules.yaml first`);
    }
    mod = { ...defaults, enabled: true };
    file.modules.push(mod);
  } else {
    mod.enabled = true;
    if (defaults) {
      mod.data_root ??= defaults.data_root;
      mod.docs_root ??= defaults.docs_root;
      mod.summary_dir ??= defaults.summary_dir;
    }
  }
  writeYamlFile(path, file);
  return mod;
}

function enableRegulations(ids: string[]): string[] {
  const enabled: string[] = [];
  const file = loadTenantRegulationsFile();
  for (const id of ids) {
    let entry = file.regulations.find((r) => r.id === id);
    if (!entry) {
      entry = { id, enabled: true };
      file.regulations.push(entry);
    } else if (!entry.enabled) {
      entry.enabled = true;
    } else {
      continue;
    }
    enabled.push(id);
  }
  if (enabled.length) {
    writeYamlFile(
      join(getTenantDir(), REGULATIONS_FILE),
      tenantRegulationsFileSchema.parse(file)
    );
  }
  return enabled;
}

function enableIsoStandards(ids: string[]): string[] {
  const enabled: string[] = [];
  const file = loadTenantStandards();
  for (const id of ids) {
    let entry = file.iso.find((r) => r.id === id);
    if (!entry) {
      entry = { id, enabled: true };
      file.iso.push(entry);
    } else if (!entry.enabled) {
      entry.enabled = true;
    } else {
      continue;
    }
    enabled.push(id);
  }
  if (enabled.length) {
    writeYamlFile(join(getTenantDir(), STANDARDS_FILE), tenantStandardsFileSchema.parse(file));
  }
  return enabled;
}

export interface ActivateModuleResult {
  moduleId: string;
  module: TenantModule;
  workspace: WorkspaceInitResult;
  seedsCopied: string[];
  regulationsEnabled: string[];
  isoEnabled: string[];
  regulationsSeeded: string[];
  controlsInitialized: number;
}

export interface ActivateModuleOptions {
  skipRegs?: boolean;
  skipIso?: boolean;
  skipControls?: boolean;
}

export function activateTenantModule(
  moduleId: string,
  opts: ActivateModuleOptions = {}
): ActivateModuleResult {
  const manifest = loadModuleManifest(moduleId);
  if (!manifest) {
    throw new Error(`Module manifest not found: ${moduleId}`);
  }

  const mod = enableModuleInYaml(moduleId);
  const dataRoot =
    mod.data_root?.replace(/\/$/, "") ??
    MODULE_DEFAULT_DATA_ROOT[moduleId]?.replace(/\/$/, "") ??
    `data/${moduleId.replace(/_/g, "-")}`;

  const seedsCopied: string[] = [];
  for (const seed of manifest.activation_seeds) {
    if (copyActivationSeed(moduleId, seed, dataRoot)) {
      seedsCopied.push(seed.replace(/\.example$/, ""));
    }
  }

  scaffoldModuleExtensionDocs(moduleId);

  const agentId = MODULE_AGENT[moduleId];
  const workspace = agentId ? ensureAgentWorkspace(agentId) : { created: [], skipped: [] };

  const regulationsEnabled =
    opts.skipRegs || !manifest.optional_regulations?.length
      ? []
      : enableRegulations(manifest.optional_regulations.filter((id) => id.startsWith("REG-")));

  const isoEnabled =
    opts.skipIso || !MODULE_ISO[moduleId]?.length
      ? []
      : enableIsoStandards(MODULE_ISO[moduleId]!);

  const regulationsSeeded =
    regulationsEnabled.length > 0
      ? seedRegulationDocs({ ids: regulationsEnabled }).seeded
      : [];

  const controlsInitialized =
    opts.skipControls || (!isoEnabled.length && !regulationsEnabled.length)
      ? 0
      : initTenantControlsFile().count;

  return {
    moduleId,
    module: mod,
    workspace,
    seedsCopied,
    regulationsEnabled,
    isoEnabled,
    regulationsSeeded,
    controlsInitialized,
  };
}

export function formatActivateModuleResult(result: ActivateModuleResult): string {
  const lines = [
    `✓ Module "${result.moduleId}" activated`,
    `  data_root: ${result.module.data_root ?? "—"}`,
    `  docs_root: ${result.module.docs_root ?? "—"}`,
  ];
  if (result.seedsCopied.length) {
    lines.push(`  seeds: ${result.seedsCopied.join(", ")}`);
  }
  if (result.workspace.created.length) {
    lines.push(`  workspace created: ${result.workspace.created.join(", ")}`);
  }
  if (result.regulationsEnabled.length) {
    lines.push(`  regulations enabled: ${result.regulationsEnabled.join(", ")}`);
  }
  if (result.regulationsSeeded.length) {
    lines.push(`  regulation docs seeded: ${result.regulationsSeeded.join(", ")}`);
  }
  if (result.isoEnabled.length) {
    lines.push(`  ISO enabled: ${result.isoEnabled.join(", ")}`);
  }
  if (result.controlsInitialized) {
    lines.push(`  controls initialized: ${result.controlsInitialized} entries`);
  }
  return lines.join("\n");
}
