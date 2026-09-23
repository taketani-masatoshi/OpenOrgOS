/**
 * Agent documentation drift checks — org-chart · roster mirror vs catalog.
 * writeFileSync for sync stays here (canonical-write-baseline).
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
  GENERATED_MARKER_PREFIX,
  generatedMarker,
  replaceGeneratedSection,
  extractGeneratedSection,
} from "./agents/docs-sync/generated-section.js";
import {
  ORG_CHART_PATH,
  ORG_CHART_SIXTEEN_ROLE_IDS,
  ORG_CHART_MERMAID_AGENT_IDS,
  buildOrgChartMermaid,
  buildOrgChartMermaidBlock,
  buildOrgChartSixteenTable,
  validateOrgChartDrift,
} from "./agents/docs-sync/org-chart.js";
import {
  STEWARD_ROSTER_PATH,
  buildCatalogRosterIndex,
  buildCatalogStatsBlock,
  validateStewardRosterDrift,
} from "./agents/docs-sync/roster-index.js";
import {
  SKILL_DELEGATION_MAP_PATH,
  buildSkillRegistryIndex,
  buildSkillDelegationRuntimeNote,
  buildAgentLabelIndex,
  buildExecutingAgentOverrideTable,
  buildStewardSelfExecuteTable,
  buildRoutingSkillIndex,
  buildExecutionDecisionTree,
  validateSkillDelegationNarrativeDrift,
} from "./agents/docs-sync/delegation-map.js";
import {
  validateAgentDocsGeneratedDrift,
  validateAgentDocsDrift,
} from "./agents/docs-sync/drift.js";

export {
  GENERATED_MARKER_PREFIX,
  generatedMarker,
  replaceGeneratedSection,
  extractGeneratedSection,
  ORG_CHART_PATH,
  ORG_CHART_SIXTEEN_ROLE_IDS,
  ORG_CHART_MERMAID_AGENT_IDS,
  buildOrgChartMermaid,
  buildOrgChartMermaidBlock,
  buildOrgChartSixteenTable,
  validateOrgChartDrift,
  STEWARD_ROSTER_PATH,
  buildCatalogRosterIndex,
  buildCatalogStatsBlock,
  validateStewardRosterDrift,
  SKILL_DELEGATION_MAP_PATH,
  buildSkillRegistryIndex,
  buildSkillDelegationRuntimeNote,
  buildAgentLabelIndex,
  buildExecutingAgentOverrideTable,
  buildStewardSelfExecuteTable,
  buildRoutingSkillIndex,
  buildExecutionDecisionTree,
  validateSkillDelegationNarrativeDrift,
  validateAgentDocsGeneratedDrift,
  validateAgentDocsDrift,
};

export function syncAgentDocs(write = false): {
  orgChart: string;
  roster: string;
  delegation: string;
} {
  let orgChart = readFileSync(ORG_CHART_PATH, "utf-8");
  orgChart = replaceGeneratedSection(orgChart, "org-chart-mermaid", buildOrgChartMermaidBlock());
  orgChart = replaceGeneratedSection(orgChart, "org-chart-sixteen", buildOrgChartSixteenTable());

  let roster = readFileSync(STEWARD_ROSTER_PATH, "utf-8");
  roster = replaceGeneratedSection(roster, "catalog-index", buildCatalogRosterIndex());
  roster = replaceGeneratedSection(roster, "catalog-stats", buildCatalogStatsBlock());

  let delegation = readFileSync(SKILL_DELEGATION_MAP_PATH, "utf-8");
  delegation = replaceGeneratedSection(delegation, "agent-label-index", buildAgentLabelIndex());
  delegation = replaceGeneratedSection(
    delegation,
    "executing-agent-overrides",
    buildExecutingAgentOverrideTable()
  );
  delegation = replaceGeneratedSection(
    delegation,
    "steward-self-execute",
    buildStewardSelfExecuteTable()
  );
  delegation = replaceGeneratedSection(delegation, "routing-skill-index", buildRoutingSkillIndex());
  delegation = replaceGeneratedSection(
    delegation,
    "execution-decision-tree",
    buildExecutionDecisionTree()
  );
  delegation = replaceGeneratedSection(
    delegation,
    "skill-registry-index",
    buildSkillRegistryIndex()
  );
  delegation = replaceGeneratedSection(
    delegation,
    "skill-runtime-note",
    buildSkillDelegationRuntimeNote()
  );

  if (write) {
    writeFileSync(ORG_CHART_PATH, orgChart, "utf-8");
    writeFileSync(STEWARD_ROSTER_PATH, roster, "utf-8");
    writeFileSync(SKILL_DELEGATION_MAP_PATH, delegation, "utf-8");
  }
  return { orgChart, roster, delegation };
}
