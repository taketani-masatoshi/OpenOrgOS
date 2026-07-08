import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { AgentReadinessAxis, AgentReadinessResult } from "../../schemas/agent-capability.js";
import {
  agentDefinitionPath,
  getAgentCapability,
  listAgentCapabilities,
  readAgentDefinition,
} from "./agent-capability.js";
import { loadRoutingRegistry } from "./routing.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { getTenantDir, resolveTenantPath } from "./tenant.js";
import { getInstallRoot } from "./orgos-paths.js";

let _routingRegistry: ReturnType<typeof loadRoutingRegistry> | null = null;
let _skillRegistry: ReturnType<typeof loadSkillRegistry> | null = null;

function routingRegistry() {
  _routingRegistry ??= loadRoutingRegistry();
  return _routingRegistry;
}

function skillRegistry() {
  _skillRegistry ??= loadSkillRegistry();
  return _skillRegistry;
}

const WEIGHTS = {
  definition: 15,
  skill_cli: 20,
  data_sot: 15,
  routing: 10,
  dashboard: 15,
  test: 10,
  tenant: 15,
} as const;

function pathExistsTenant(rel: string): boolean {
  try {
    return existsSync(resolveTenantPath(rel.replace(/\/$/, "")));
  } catch {
    return false;
  }
}

function templateHasPath(rel: string): boolean {
  const base = rel.replace(/\/$/, "");
  const templatePath = join(getInstallRoot(), "tenants/_template", base);
  return existsSync(templatePath);
}

function hasRecentPulseSummary(agentId: AgentId, slug: string): boolean {
  const dirs =
    agentId === "executive_steward"
      ? ["docs/reports/executive-notes"]
      : [`docs/reports/agent-summaries/${slug}`];
  for (const rel of dirs) {
    const dir = join(getTenantDir(), rel);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files.length > 0) return true;
  }
  return false;
}

function scoreDefinition(agentId: AgentId): AgentReadinessAxis {
  const md = readAgentDefinition(agentId);
  const checks = [
    { label: "agent.md 存在", ok: md.length > 0 },
    { label: "目的", ok: md.includes("## 目的") },
    { label: "禁止", ok: md.includes("## 禁止") },
    { label: "要約出力先", ok: md.includes("要約出力") || md.includes("agent-summaries") },
    { label: "CLI/pulse", ok: md.includes("orgos agent pulse") || md.includes("npm run orgos") },
  ];
  const ok = checks.filter((c) => c.ok).length;
  const score = Math.round((ok / checks.length) * WEIGHTS.definition);
  return {
    id: "definition",
    label: "定義",
    score,
    max: WEIGHTS.definition,
    detail: checks.filter((c) => !c.ok).map((c) => c.label).join(", ") || "OK",
  };
}

function scoreSkillCli(agentId: AgentId, cap: ReturnType<typeof getAgentCapability>): AgentReadinessAxis {
  const skills = skillRegistry();
  const dedicated = cap?.skills.filter((sid) => skills.some((s) => s.id === sid)) ?? [];
  let score = 12; // agent pulse baseline
  if (dedicated.length >= 1) score += 4;
  if (dedicated.length >= 2) score += 4;
  score = Math.min(score, WEIGHTS.skill_cli);
  return {
    id: "skill_cli",
    label: "Skill/CLI",
    score,
    max: WEIGHTS.skill_cli,
    detail:
      dedicated.length > 0
        ? `${dedicated.join(", ")} + agent pulse`
        : "agent pulse のみ",
  };
}

function scoreDataSot(cap: ReturnType<typeof getAgentCapability>): AgentReadinessAxis {
  const paths = [...(cap?.data_paths ?? []), ...(cap?.docs_paths ?? [])];
  if (paths.length === 0) {
    return { id: "data_sot", label: "データSoT", score: 8, max: WEIGHTS.data_sot, detail: "パス未定義" };
  }
  let tenantHits = 0;
  let templateHits = 0;
  for (const p of paths) {
    if (pathExistsTenant(p)) tenantHits++;
    if (templateHasPath(p)) templateHits++;
  }
  const ratio = (tenantHits + templateHits) / (paths.length * 2);
  const score = Math.round(ratio * WEIGHTS.data_sot);
  return {
    id: "data_sot",
    label: "データSoT",
    score,
    max: WEIGHTS.data_sot,
    detail: `tenant ${tenantHits}/${paths.length} · template ${templateHits}/${paths.length}`,
  };
}

function scoreRouting(agentId: AgentId, cap: ReturnType<typeof getAgentCapability>): AgentReadinessAxis {
  const routes = routingRegistry().routes.filter((r) => r.agent === agentId);
  const expected = cap?.route_ids.length ?? 0;
  const matched = cap?.route_ids.filter((id) => routes.some((r) => r.id === id)) ?? [];
  if (routes.length === 0 && expected === 0) {
    return { id: "routing", label: "routing", score: 8, max: WEIGHTS.routing, detail: "route なし（コア委譲）" };
  }
  const score =
    expected > 0
      ? Math.round((matched.length / expected) * WEIGHTS.routing)
      : Math.min(routes.length * 3, WEIGHTS.routing);
  return {
    id: "routing",
    label: "routing",
    score: Math.min(score, WEIGHTS.routing),
    max: WEIGHTS.routing,
    detail: matched.length ? matched.join(", ") : routes.map((r) => r.id).join(", ") || "未登録",
  };
}

function scoreDashboard(agentId: AgentId, slug: string): AgentReadinessAxis {
  const has = hasRecentPulseSummary(agentId, slug);
  return {
    id: "dashboard",
    label: "要約",
    score: has ? WEIGHTS.dashboard : Math.round(WEIGHTS.dashboard * 0.6),
    max: WEIGHTS.dashboard,
    detail: has ? "pulse 要約あり" : "pulse 未実行（dashboard 時に生成可）",
  };
}

function scoreTest(agentId: AgentId): AgentReadinessAxis {
  const inManifest = listAgentCapabilities().some((a) => a.id === agentId);
  return {
    id: "test",
    label: "テスト",
    score: inManifest ? WEIGHTS.test : 0,
    max: WEIGHTS.test,
    detail: inManifest ? "readiness テスト対象" : "manifest 外",
  };
}

function scoreTenant(cap: ReturnType<typeof getAgentCapability>): AgentReadinessAxis {
  const paths = [...(cap?.data_paths ?? []), ...(cap?.docs_paths ?? [])];
  if (paths.length === 0) {
    return { id: "tenant", label: "テナント", score: 10, max: WEIGHTS.tenant, detail: "—" };
  }
  const templateOk = paths.every((p) => templateHasPath(p));
  const tenantOk = paths.filter((p) => pathExistsTenant(p)).length;
  let score = templateOk ? 10 : 5;
  if (tenantOk >= paths.length) score = WEIGHTS.tenant;
  else if (tenantOk > 0) score = Math.max(score, 12);
  return {
    id: "tenant",
    label: "テナント",
    score: Math.min(score, WEIGHTS.tenant),
    max: WEIGHTS.tenant,
    detail: `tenant ${tenantOk}/${paths.length} · template ${templateOk ? "OK" : "partial"}`,
  };
}

export function computeAgentReadiness(agentId: AgentId): AgentReadinessResult {
  const cap = getAgentCapability(agentId);
  const slug = cap?.summary_slug ?? agentId.replace(/_/g, "-");
  const axes = [
    scoreDefinition(agentId),
    scoreSkillCli(agentId, cap),
    scoreDataSot(cap),
    scoreRouting(agentId, cap),
    scoreDashboard(agentId, slug),
    scoreTest(agentId),
    scoreTenant(cap),
  ];
  const total = axes.reduce((s, a) => s + a.score, 0);
  const max = axes.reduce((s, a) => s + a.max, 0);
  const pct = Math.round((total / max) * 100);
  const gaps = axes.filter((a) => a.score < a.max * 0.8).map((a) => `${a.label}: ${a.detail}`);
  return {
    agent_id: agentId,
    name: agentId,
    total,
    pct,
    axes,
    gaps,
  };
}

export function computeAllAgentReadiness(): AgentReadinessResult[] {
  return listAgentCapabilities().map((a) => computeAgentReadiness(a.id));
}

export function formatAgentReadinessReport(results: AgentReadinessResult[]): string {
  const lines = [
    "# Agent Readiness — 完成度",
    "",
    "| Agent | % | 定義 | Skill | データ | route | 要約 | test | tenant |",
    "|-------|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of results.sort((a, b) => a.pct - b.pct)) {
    const ax = Object.fromEntries(r.axes.map((a) => [a.id, a.score]));
    lines.push(
      `| ${r.agent_id} | ${r.pct} | ${ax.definition ?? 0} | ${ax.skill_cli ?? 0} | ${ax.data_sot ?? 0} | ${ax.routing ?? 0} | ${ax.dashboard ?? 0} | ${ax.test ?? 0} | ${ax.tenant ?? 0} |`
    );
  }
  const below = results.filter((r) => r.pct < 80);
  lines.push("", `**80% 未満:** ${below.length} 件`, "");
  return lines.join("\n");
}

export function agentDefinitionExists(agentId: AgentId): boolean {
  return existsSync(agentDefinitionPath(agentId));
}
