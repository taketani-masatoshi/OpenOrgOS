import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { AgentReadinessAxis, AgentReadinessResult } from "../../schemas/agent-capability.js";
import type { AgentReadinessProfile } from "../../schemas/agent-catalog.js";
import {
  agentDefinitionPath,
  getAgentCapability,
} from "./agent-capability.js";
import { getCatalogAgent, isAgentActive, listCatalogAgents } from "./agent-catalog.js";
import { listActiveTenantAgents } from "./agent-roster.js";
import { evaluateAgentPulseChecks } from "./agent-pulse.js";
import { loadRoutingRegistry } from "./routing.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { resolveExecutingAgentId } from "./skill-execution-mode.js";
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
  orchestration: 2,
} as const;

const EXECUTIVE_STEWARD_SKILL_CLI_MAX = WEIGHTS.skill_cli - WEIGHTS.orchestration;

function frameworkWorkspacePathExists(rel: string): boolean {
  const base = rel.replace(/\/$/, "");
  const frameworkPrefixes = ["docs/org-os/", "schemas/", "src/", "steward/", "tests/"];
  if (!frameworkPrefixes.some((prefix) => `${base}/`.startsWith(prefix))) return false;
  return existsSync(join(getInstallRoot(), base));
}

function pathExistsTenant(rel: string): boolean {
  if (frameworkWorkspacePathExists(rel)) return true;
  try {
    return existsSync(resolveTenantPath(rel.replace(/\/$/, "")));
  } catch {
    return false;
  }
}

function templateHasPath(rel: string): boolean {
  const base = rel.replace(/\/$/, "");
  if (frameworkWorkspacePathExists(rel)) return true;
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
  const agent = getCatalogAgent(agentId);
  const cap = getAgentCapability(agentId);
  const checks = [
    { label: "catalog entry", ok: agent != null && agent.path.length > 0 },
    { label: "definition file", ok: agentDefinitionExists(agentId) },
    { label: "capability manifest", ok: cap != null },
    { label: "read access declared", ok: (agent?.access.read.length ?? 0) > 0 },
    { label: "catalog active", ok: agent?.status === "active" },
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
  const owned = skills.filter((skill) => resolveExecutingAgentId(skill) === agentId);
  const cliSkills = owned.filter((skill) => skill.runtime === "cli" && skill.cli_command);
  const manifestSkills =
    cap?.skills.filter((sid) => owned.some((skill) => skill.id === sid)) ?? [];
  let score = owned.length > 0 ? 8 : 4;
  if (cliSkills.length >= 1) score += 6;
  if (manifestSkills.length >= 2) score += 4;
  if (cliSkills.length >= 2 || owned.some((skill) => skill.runtime === "agent")) score += 2;
  const max =
    agentId === "executive_steward" ? EXECUTIVE_STEWARD_SKILL_CLI_MAX : WEIGHTS.skill_cli;
  score = Math.min(score, max);
  return {
    id: "skill_cli",
    label: "Skill/CLI",
    score,
    max,
    detail:
      owned.length > 0
        ? `${owned.length} skill(s) · ${cliSkills.length} cli · manifest ${manifestSkills.length}`
        : "no owned skills",
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

function scoreOrchestration(agentId: AgentId): AgentReadinessAxis | null {
  if (agentId !== "executive_steward") return null;
  const skills = skillRegistry();
  const routes = routingRegistry().routes;
  const checks = [
    {
      label: "orchestration_status skill",
      ok: skills.some((skill) => skill.id === "orchestration_status" && skill.runtime === "cli"),
    },
    {
      label: "orchestration-status route",
      ok: routes.some((route) => route.id === "orchestration-status"),
    },
    {
      label: "plan-graph + state machine",
      ok: frameworkWorkspacePathExists("src/lib/orchestration/plan-graph.ts"),
    },
    {
      label: "orchestration tests",
      ok: frameworkWorkspacePathExists("tests/orchestration-dag.test.ts"),
    },
  ];
  const ok = checks.filter((check) => check.ok).length;
  const score = Math.round((ok / checks.length) * WEIGHTS.orchestration);
  return {
    id: "orchestration",
    label: "orchestration",
    score,
    max: WEIGHTS.orchestration,
    detail: checks.filter((check) => !check.ok).map((check) => check.label).join(", ") || "DAG + CLI + tests",
  };
}

function scoreDashboard(agentId: AgentId, slug: string): AgentReadinessAxis {
  const has = hasRecentPulseSummary(agentId, slug);
  const pulse = evaluateAgentPulseChecks(agentId);
  let score = has ? Math.round(WEIGHTS.dashboard * 0.5) : Math.round(WEIGHTS.dashboard * 0.3);
  const details: string[] = [has ? "pulse 要約あり" : "pulse 未実行"];
  if (pulse.total > 0) {
    const pulseScore = Math.round((pulse.ok / pulse.total) * WEIGHTS.dashboard * 0.5);
    score += pulseScore;
    details.push(`checks ${pulse.ok}/${pulse.total} OK`);
    if (pulse.stale.length) {
      details.push(`stale: ${pulse.stale.slice(0, 2).join("; ")}`);
    }
  } else {
    score += Math.round(WEIGHTS.dashboard * 0.2);
  }
  return {
    id: "dashboard",
    label: "要約",
    score: Math.min(score, WEIGHTS.dashboard),
    max: WEIGHTS.dashboard,
    detail: details.join(" · "),
  };
}

function scoreEvidenceActivationBoundary(agentId: AgentId): AgentReadinessAxis {
  const agent = getCatalogAgent(agentId);
  const profile = agent?.readiness_profile ?? "operational";
  const active =
    profile === "advisor"
      ? agent?.activation === "developer_explicit"
      : profile === "bootstrap"
        ? agent?.status !== "active"
        : isAgentActive(agentId, { profile: "operational", mode: "consult" });
  const boundary =
    agent != null &&
    agentDefinitionExists(agentId) &&
    (profile !== "advisor" ||
      (agent.class === "advisor" &&
        agent.access.write.length === 0 &&
        agent.auto_route === false &&
        agent.auto_pulse === false));
  const owned = skillRegistry().filter((skill) => resolveExecutingAgentId(skill) === agentId);
  const cliOwned = owned.filter((skill) => skill.runtime === "cli" && skill.cli_command);
  const skillEvidence = cliOwned.length > 0 ? 3 : owned.length > 0 ? 2 : 0;
  const score = (active ? 4 : 0) + (boundary ? 3 : 0) + skillEvidence;
  const details = [
    `activation: ${active ? "OK" : "not satisfied"}`,
    `boundary: ${boundary ? "OK" : "not satisfied"}`,
    `skills: ${owned.length} owned · ${cliOwned.length} cli`,
  ];
  return {
    id: "test",
    label: "証拠",
    score,
    max: WEIGHTS.test,
    detail: details.join(" · "),
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

function scoreAdvisorDefinition(agentId: AgentId): AgentReadinessAxis {
  const agent = getCatalogAgent(agentId);
  const checks = [
    { label: "catalog advisor", ok: agent?.class === "advisor" },
    { label: "definition file", ok: agentDefinitionExists(agentId) },
    { label: "no write access", ok: (agent?.access.write.length ?? 0) === 0 },
    { label: "auto_route off", ok: agent?.auto_route === false },
    { label: "developer_explicit", ok: agent?.activation === "developer_explicit" },
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

export function computeAgentReadiness(agentId: AgentId): AgentReadinessResult {
  const catalogAgent = getCatalogAgent(agentId);
  const profile = catalogAgent?.readiness_profile ?? "operational";
  const cap = getAgentCapability(agentId);
  const slug = cap?.summary_slug ?? agentId.replace(/_/g, "-");

  if (profile === "advisor") {
    const axes = [
      scoreAdvisorDefinition(agentId),
      scoreSkillCli(agentId, cap),
      { id: "routing", label: "routing", score: WEIGHTS.routing, max: WEIGHTS.routing, detail: "advisor — auto-route なし" },
      { id: "data_sot", label: "データSoT", score: WEIGHTS.data_sot, max: WEIGHTS.data_sot, detail: "advisor — tenant 不要" },
      { id: "dashboard", label: "要約", score: WEIGHTS.dashboard, max: WEIGHTS.dashboard, detail: "advisor — pulse 不要" },
      scoreEvidenceActivationBoundary(agentId),
      { id: "tenant", label: "テナント", score: WEIGHTS.tenant, max: WEIGHTS.tenant, detail: "advisor — tenant 不要" },
    ];
    const total = axes.reduce((s, a) => s + a.score, 0);
    const max = axes.reduce((s, a) => s + a.max, 0);
    const pct = Math.round((total / max) * 100);
    return {
      agent_id: agentId,
      name: catalogAgent?.name ?? agentId,
      profile,
      total,
      pct,
      axes,
      gaps: [],
    };
  }

  if (profile === "bootstrap") {
    const axes = [
      scoreDefinition(agentId),
      scoreSkillCli(agentId, cap),
      scoreDataSot(cap),
      scoreEvidenceActivationBoundary(agentId),
    ];
    const total = axes.reduce((sum, axis) => sum + axis.score, 0);
    const max = axes.reduce((sum, axis) => sum + axis.max, 0);
    return {
      agent_id: agentId,
      name: catalogAgent?.name ?? agentId,
      profile,
      total,
      pct: Math.round((total / max) * 100),
      axes,
      gaps: axes
        .filter((axis) => axis.score < axis.max * 0.8)
        .map((axis) => `${axis.label}: ${axis.detail}`),
    };
  }

  const axes = [
    scoreDefinition(agentId),
    scoreSkillCli(agentId, cap),
    scoreDataSot(cap),
    scoreRouting(agentId, cap),
    scoreDashboard(agentId, slug),
    scoreEvidenceActivationBoundary(agentId),
    scoreTenant(cap),
  ];
  const orchestration = scoreOrchestration(agentId);
  if (orchestration) axes.push(orchestration);
  const total = axes.reduce((s, a) => s + a.score, 0);
  const max = axes.reduce((s, a) => s + a.max, 0);
  const pct = Math.round((total / max) * 100);
  const gaps = axes.filter((a) => a.score < a.max * 0.8).map((a) => `${a.label}: ${a.detail}`);
  return {
    agent_id: agentId,
    name: catalogAgent?.name ?? agentId,
    profile,
    total,
    pct,
    axes,
    gaps,
  };
}

export function computeAllAgentReadiness(): AgentReadinessResult[] {
  return computeAgentReadinessProfile("operational");
}

export function computeOperationalAgentReadiness(): AgentReadinessResult[] {
  return computeAllAgentReadiness();
}

export function computeAgentReadinessProfile(
  profile: AgentReadinessProfile
): AgentReadinessResult[] {
  const ids =
    profile === "operational"
      ? listActiveTenantAgents("operational").filter((id) => {
          const agent = getCatalogAgent(id);
          return agent?.class !== "advisor" && agent?.status !== "planned";
        })
      : listCatalogAgents()
          .filter((agent) => agent.readiness_profile === profile && agent.status !== "planned")
          .map((agent) => agent.id);
  return ids.map((id) => computeAgentReadiness(id));
}

export function computeAllAgentReadinessProfiles(): Record<
  AgentReadinessProfile,
  AgentReadinessResult[]
> {
  return {
    operational: computeAgentReadinessProfile("operational"),
    advisor: computeAgentReadinessProfile("advisor"),
    bootstrap: computeAgentReadinessProfile("bootstrap"),
  };
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
