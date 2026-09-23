import { readFileSync } from "node:fs";
import {
  buildAgentLabelIndex,
  buildExecutingAgentOverrideTable,
  buildExecutionDecisionTree,
  buildRoutingSkillIndex,
  buildSkillDelegationRuntimeNote,
  buildSkillRegistryIndex,
  buildStewardSelfExecuteTable,
  SKILL_DELEGATION_MAP_PATH,
  validateSkillDelegationNarrativeDrift,
} from "./delegation-map.js";
import { extractGeneratedSection } from "./generated-section.js";
import {
  buildOrgChartMermaidBlock,
  buildOrgChartSixteenTable,
  ORG_CHART_PATH,
  validateOrgChartDrift,
} from "./org-chart.js";
import {
  buildCatalogRosterIndex,
  buildCatalogStatsBlock,
  STEWARD_ROSTER_PATH,
  validateStewardRosterDrift,
} from "./roster-index.js";

export function validateAgentDocsGeneratedDrift(): string[] {
  const issues: string[] = [];
  const orgChart = readFileSync(ORG_CHART_PATH, "utf-8");
  const roster = readFileSync(STEWARD_ROSTER_PATH, "utf-8");
  const delegation = readFileSync(SKILL_DELEGATION_MAP_PATH, "utf-8");

  for (const [file, name, expected, text] of [
    ["org-chart.md", "org-chart-mermaid", buildOrgChartMermaidBlock(), orgChart],
    ["org-chart.md", "org-chart-sixteen", buildOrgChartSixteenTable(), orgChart],
    ["steward_agent_roster.md", "catalog-index", buildCatalogRosterIndex(), roster],
    ["steward_agent_roster.md", "catalog-stats", buildCatalogStatsBlock(), roster],
    ["skill_delegation_map.md", "agent-label-index", buildAgentLabelIndex(), delegation],
    [
      "skill_delegation_map.md",
      "executing-agent-overrides",
      buildExecutingAgentOverrideTable(),
      delegation,
    ],
    ["skill_delegation_map.md", "steward-self-execute", buildStewardSelfExecuteTable(), delegation],
    ["skill_delegation_map.md", "routing-skill-index", buildRoutingSkillIndex(), delegation],
    [
      "skill_delegation_map.md",
      "execution-decision-tree",
      buildExecutionDecisionTree(),
      delegation,
    ],
    ["skill_delegation_map.md", "skill-registry-index", buildSkillRegistryIndex(), delegation],
    [
      "skill_delegation_map.md",
      "skill-runtime-note",
      buildSkillDelegationRuntimeNote(),
      delegation,
    ],
  ] as const) {
    const section = extractGeneratedSection(text, name);
    if (!section) {
      issues.push(`${file}: missing generated section ${name}; run npm run agent:docs:sync`);
      continue;
    }
    if (section.trim() !== expected.trim()) {
      issues.push(`${file}: stale generated section ${name}; run npm run agent:docs:sync`);
    }
  }
  return issues;
}

export function validateAgentDocsDrift(): string[] {
  return [
    ...validateOrgChartDrift(),
    ...validateStewardRosterDrift(),
    ...validateSkillDelegationNarrativeDrift(),
    ...validateAgentDocsGeneratedDrift(),
  ];
}
