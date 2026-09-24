import type { AgentId } from "../../../../schemas/classification.js";
import type { AgentReadinessResult } from "../../../../schemas/agent-capability.js";
import type { AgentReadinessProfile } from "../../../../schemas/agent-catalog.js";
import { getAgentCapability } from "../../agent-capability.js";
import { getCatalogAgent, listCatalogAgents } from "../../agent-catalog.js";
import { listActiveTenantAgents } from "../../agent-roster.js";
import { evaluateAgentPulseChecks } from "../../agent-pulse.js";
import {
  scoreAdvisorDefinition,
  scoreDashboard,
  scoreDataSot,
  scoreDefinition,
  scoreEvidenceActivationBoundary,
  scoreOrchestration,
  scoreRouting,
  scoreSkillCli,
  scoreTenant,
} from "./axes.js";
import { WEIGHTS } from "./weights.js";

export { agentDefinitionExists } from "../definition.js";

export function computeAgentReadiness(agentId: AgentId): AgentReadinessResult {
  const catalogAgent = getCatalogAgent(agentId);
  const profile = catalogAgent?.readiness_profile ?? "operational";
  const cap = getAgentCapability(agentId);
  const slug = cap?.summary_slug ?? agentId.replace(/_/g, "-");

  if (profile === "advisor") {
    const axes = [
      scoreAdvisorDefinition(agentId),
      scoreSkillCli(agentId, cap),
      {
        id: "routing",
        label: "routing",
        score: WEIGHTS.routing,
        max: WEIGHTS.routing,
        detail: "advisor — auto-route なし",
      },
      {
        id: "data_sot",
        label: "データSoT",
        score: WEIGHTS.data_sot,
        max: WEIGHTS.data_sot,
        detail: "advisor — tenant 不要",
      },
      {
        id: "dashboard",
        label: "要約",
        score: WEIGHTS.dashboard,
        max: WEIGHTS.dashboard,
        detail: "advisor — pulse 不要",
      },
      scoreEvidenceActivationBoundary(agentId),
      {
        id: "tenant",
        label: "テナント",
        score: WEIGHTS.tenant,
        max: WEIGHTS.tenant,
        detail: "advisor — tenant 不要",
      },
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
    scoreDashboard(agentId, slug, evaluateAgentPulseChecks(agentId)),
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
