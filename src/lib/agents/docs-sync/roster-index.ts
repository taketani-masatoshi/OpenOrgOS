import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listCatalogAgents, resolveAgentId } from "../../agent-catalog.js";
import { loadSkillRegistry } from "../../skill-registry.js";
import { ROOT_DIR } from "../../tenant.js";
import { agentMdLink } from "./org-chart.js";

export const STEWARD_ROSTER_PATH = join(
  ROOT_DIR,
  "steward/core/orchestrators/steward_agent_roster.md"
);

export function buildCatalogRosterIndex(): string {
  const agents = [...listCatalogAgents()].sort((a, b) => {
    const tier = a.tier.localeCompare(b.tier);
    return tier !== 0 ? tier : a.id.localeCompare(b.id);
  });
  const lines = [
    "| id | tier | class | activation | reports_to | definition |",
    "|----|------|-------|------------|------------|------------|",
  ];
  for (const agent of agents) {
    lines.push(
      `| \`${agent.id}\` | ${agent.tier} | ${agent.class} | ${agent.activation} | ${agent.reports_to ?? "—"} | ${agentMdLink(agent)} |`
    );
  }
  return lines.join("\n");
}

export function buildCatalogStatsBlock(): string {
  const agents = listCatalogAgents();
  const activeAgents = agents.filter((agent) => agent.status === "active").length;
  const skills = loadSkillRegistry();
  const cliSkills = skills.filter((skill) => skill.runtime === "cli").length;
  const agentSkills = skills.filter((skill) => skill.runtime === "agent").length;
  return [
    "| 指標 | 値 | 正本 |",
    "|------|-----|------|",
    `| catalog agents | ${agents.length} | \`steward/core/agents/registry.yaml\` |`,
    `| active agents | ${activeAgents} | registry \`status: active\` |`,
    `| skills (registry) | ${skills.length} | \`steward/core/skills/registry.yaml\` + modules |`,
    `| runtime: cli | ${cliSkills} | registry |`,
    `| runtime: agent | ${agentSkills} | registry（旧 cursor-only 含む） |`,
    `| テナント有効化 | \`orgos agent roster show\` | \`data/operator/agents.yaml\` |`,
    `| pulse 対象 | active roster のみ | \`orgos agent pulse --all\` |`,
  ].join("\n");
}

function extractBacktickIds(markdown: string): string[] {
  const ids = new Set<string>();
  const re = /`([a-z][a-z0-9_]+)`/g;
  for (const match of markdown.matchAll(re)) {
    ids.add(match[1]!);
  }
  return [...ids];
}

export function validateStewardRosterDrift(): string[] {
  const issues: string[] = [];
  const text = readFileSync(STEWARD_ROSTER_PATH, "utf-8");
  const catalogIds = new Set<string>(listCatalogAgents().map((a) => a.id));

  if (!text.includes("registry.yaml")) {
    issues.push("steward_agent_roster.md must declare registry.yaml as canonical source");
  }

  const tableIds = extractBacktickIds(text).filter((id) => catalogIds.has(id) || resolveAgentId(id));
  for (const id of tableIds) {
    if (!resolveAgentId(id)) {
      issues.push(`steward_agent_roster.md references unknown agent: ${id}`);
    }
  }

  for (const required of ["executive_steward", "secretary", "finance", "contract", "compliance", "operations"]) {
    if (!text.includes(required)) {
      issues.push(`steward_agent_roster.md missing core agent mention: ${required}`);
    }
  }
  return issues;
}
