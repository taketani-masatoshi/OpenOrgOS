import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkModuleCatalogOnly,
  listCatalogModuleIds,
  loadEnabledModulesSafe,
  loadModuleManifest,
  resolveModuleLocation,
} from "./modules.js";
import { getModuleTier, type ReadinessTier } from "./module-readiness.js";
import { describeModuleCliRegistrations } from "./module-cli.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { getInstallRoot } from "./orgos-paths.js";
import { listTenantIds, setTenantId } from "./tenant.js";

export interface ModuleReadinessAxis {
  id: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface ModuleReadinessResult {
  module_id: string;
  tier: ReadinessTier;
  total: number;
  pct: number;
  axes: ModuleReadinessAxis[];
  gaps: string[];
}

const WEIGHTS = {
  definition: 15,
  contract: 15,
  cli: 20,
  skill: 10,
  test: 15,
  tier: 10,
  operational: 15,
} as const;

function scoreDefinition(moduleId: string): ModuleReadinessAxis {
  const manifest = loadModuleManifest(moduleId);
  const location = resolveModuleLocation(moduleId);
  const checks = [
    { label: "manifest", ok: manifest?.id === moduleId },
    { label: "agent.md", ok: location != null },
    { label: "catalog id", ok: listCatalogModuleIds().includes(moduleId) },
  ];
  const ok = checks.filter((c) => c.ok).length;
  return {
    id: "definition",
    label: "定義",
    score: Math.round((ok / checks.length) * WEIGHTS.definition),
    max: WEIGHTS.definition,
    detail: checks.filter((c) => !c.ok).map((c) => c.label).join(", ") || "OK",
  };
}

function scoreContract(moduleId: string, tier: ReadinessTier): ModuleReadinessAxis {
  const issues = checkModuleCatalogOnly(moduleId, tier);
  if (issues.length === 0) {
    return {
      id: "contract",
      label: "契約",
      score: WEIGHTS.contract,
      max: WEIGHTS.contract,
      detail: "seed OK",
    };
  }
  const ratio = Math.max(0, 1 - issues.length / 4);
  return {
    id: "contract",
    label: "契約",
    score: Math.round(ratio * WEIGHTS.contract),
    max: WEIGHTS.contract,
    detail: issues.slice(0, 3).map((i) => i.message).join("; "),
  };
}

function scoreCli(moduleId: string): ModuleReadinessAxis {
  const registration = describeModuleCliRegistrations().get(moduleId);
  const declared = loadModuleManifest(moduleId)?.cli_commands ?? [];

  if (!registration) {
    return { id: "cli", label: "CLI", score: 0, max: WEIGHTS.cli, detail: "module-cli 未登録" };
  }
  if (declared.length === 0) {
    return {
      id: "cli",
      label: "CLI",
      score: 12,
      max: WEIGHTS.cli,
      detail: "bundle 登録済 · cli_commands 未宣言",
    };
  }

  const missing = declared.filter((name) => !registration.subcommands.includes(name));
  const root = `orgos ${registration.rootPath.join(" ")}`;
  if (missing.length > 0) {
    return {
      id: "cli",
      label: "CLI",
      score: 16,
      max: WEIGHTS.cli,
      detail: `${root} · 未登録: ${missing.slice(0, 3).join(", ")}`,
    };
  }

  return {
    id: "cli",
    label: "CLI",
    score: WEIGHTS.cli,
    max: WEIGHTS.cli,
    detail: `${root} · cli_commands ${declared.length} · 契約一致`,
  };
}

function scoreSkill(moduleId: string): ModuleReadinessAxis {
  const skills = loadSkillRegistry(true).filter((s) => s.moduleId === moduleId);
  if (skills.length === 0) {
    return {
      id: "skill",
      label: "Skill",
      score: 4,
      max: WEIGHTS.skill,
      detail: "module skill なし",
    };
  }
  const cliSkills = skills.filter((s) => s.runtime === "cli" && s.cli_command);
  let score = 6;
  if (cliSkills.length >= 1) score += 2;
  if (skills.length >= 2) score += 2;
  return {
    id: "skill",
    label: "Skill",
    score: Math.min(score, WEIGHTS.skill),
    max: WEIGHTS.skill,
    detail: `${skills.length} skill · ${cliSkills.length} cli`,
  };
}

function moduleHasDedicatedTest(moduleId: string): boolean {
  const needles = [moduleId, moduleId.replace(/_/g, "-")];
  const testsDir = join(getInstallRoot(), "tests");

  function scanDir(dir: string): boolean {
    if (!existsSync(dir)) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (scanDir(full)) return true;
        continue;
      }
      if (!entry.name.endsWith(".test.ts")) continue;
      if (needles.some((n) => entry.name.includes(n))) return true;
      try {
        const content = readFileSync(full, "utf-8");
        if (needles.some((n) => content.includes(n))) return true;
        if (content.includes(`@catalog-ids: ${moduleId}`)) return true;
      } catch {
        // ignore unreadable
      }
    }
    return false;
  }

  return scanDir(testsDir);
}

function scoreTest(moduleId: string): ModuleReadinessAxis {
  const has = moduleHasDedicatedTest(moduleId);
  return {
    id: "test",
    label: "テスト",
    score: has ? WEIGHTS.test : Math.round(WEIGHTS.test * 0.4),
    max: WEIGHTS.test,
    detail: has ? "専用 Vitest あり" : "専用テストなし",
  };
}

function scoreTier(tier: ReadinessTier): ModuleReadinessAxis {
  const score =
    tier === "production_ready" ? WEIGHTS.tier : tier === "activation_ready" ? 7 : 4;
  return {
    id: "tier",
    label: "tier",
    score,
    max: WEIGHTS.tier,
    detail: tier,
  };
}

function isModuleEnabledInTenant(moduleId: string, tenantId: string): boolean {
  setTenantId(tenantId);
  return loadEnabledModulesSafe().some((m) => m.id === moduleId && m.enabled);
}

function scoreOperational(moduleId: string, tenantId?: string): ModuleReadinessAxis {
  if (tenantId) {
    const enabled = isModuleEnabledInTenant(moduleId, tenantId);
    return {
      id: "operational",
      label: "稼働",
      score: enabled ? WEIGHTS.operational : 0,
      max: WEIGHTS.operational,
      detail: enabled ? `${tenantId} enabled` : `${tenantId} disabled`,
    };
  }

  const tenants = listTenantIds().filter((id) => isModuleEnabledInTenant(moduleId, id));
  const score =
    tenants.length > 0
      ? WEIGHTS.operational
      : Math.round(WEIGHTS.operational * 0.3);
  return {
    id: "operational",
    label: "稼働",
    score,
    max: WEIGHTS.operational,
    detail: tenants.length ? `${tenants.length} tenant(s)` : "未有効テナント",
  };
}

export function computeModuleReadiness(
  moduleId: string,
  opts: { tenantId?: string } = {}
): ModuleReadinessResult {
  const tier = getModuleTier(moduleId);
  const axes = [
    scoreDefinition(moduleId),
    scoreContract(moduleId, tier),
    scoreCli(moduleId),
    scoreSkill(moduleId),
    scoreTest(moduleId),
    scoreTier(tier),
    scoreOperational(moduleId, opts.tenantId),
  ];
  const total = axes.reduce((s, a) => s + a.score, 0);
  const max = axes.reduce((s, a) => s + a.max, 0);
  const pct = Math.round((total / max) * 100);
  const gaps = axes.filter((a) => a.score < a.max * 0.8).map((a) => `${a.label}: ${a.detail}`);
  return { module_id: moduleId, tier, total, pct, axes, gaps };
}

export function computeModuleReadinessForTenant(
  tenantId: string,
  moduleFilter?: string
): ModuleReadinessResult[] {
  setTenantId(tenantId);
  const enabled = new Set(loadEnabledModulesSafe().filter((m) => m.enabled).map((m) => m.id));
  const ids = moduleFilter
    ? [moduleFilter]
    : [...enabled].sort((a, b) => a.localeCompare(b));
  return ids.map((id) => computeModuleReadiness(id, { tenantId }));
}

export function computeAllModuleReadiness(moduleFilter?: string): ModuleReadinessResult[] {
  const ids = moduleFilter ? [moduleFilter] : listCatalogModuleIds();
  return ids.map((id) => computeModuleReadiness(id));
}

export function formatModuleReadinessReport(results: ModuleReadinessResult[]): string {
  const lines = [
    "# Module Readiness — 完成度",
    "",
    "| Module | % | 定義 | 契約 | CLI | Skill | test | tier | 稼働 |",
    "|--------|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of results.sort((a, b) => a.pct - b.pct)) {
    const ax = Object.fromEntries(r.axes.map((a) => [a.id, a.score]));
    lines.push(
      `| ${r.module_id} | ${r.pct} | ${ax.definition ?? 0} | ${ax.contract ?? 0} | ${ax.cli ?? 0} | ${ax.skill ?? 0} | ${ax.test ?? 0} | ${ax.tier ?? 0} | ${ax.operational ?? 0} |`
    );
  }
  const below = results.filter((r) => r.pct < 80);
  lines.push("", `**80% 未満:** ${below.length} 件`, "");
  return lines.join("\n");
}
