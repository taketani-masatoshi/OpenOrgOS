/**
 * Agent documentation drift checks — org-chart · roster mirror vs catalog.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCatalogEntry } from "../../schemas/agent-catalog.js";
import { listCatalogAgents, resolveAgentId } from "./agent-catalog.js";
import { loadRoutingRegistry } from "./routing.js";
import {
  EXECUTING_AGENT_OVERRIDES,
  STEWARD_SELF_EXECUTE_SKILLS,
} from "./skill-execution-mode.js";
import { loadSkillRegistry } from "./skill-registry.js";
import { ROOT_DIR } from "./tenant.js";

export const ORG_CHART_PATH = join(ROOT_DIR, "steward/core/agents/org-chart.md");
export const STEWARD_ROSTER_PATH = join(
  ROOT_DIR,
  "steward/core/orchestrators/steward_agent_roster.md"
);
export const SKILL_DELEGATION_MAP_PATH = join(
  ROOT_DIR,
  "steward/core/orchestrators/skill_delegation_map.md"
);

export const GENERATED_MARKER_PREFIX = "orgos:generated";

export const ORG_CHART_SIXTEEN_ROLE_IDS = [
  "coo",
  "cto",
  "engineering",
  "design_lead",
  "design",
  "sales_lead",
  "sales_outbound",
  "sales_inbound",
  "customer_success",
  "marketing_lead",
  "social_media",
  "finance",
  "personal_finance",
  "secretary",
  "legal",
  "security",
] as const;

const SIXTEEN_ROLE_LABELS: Record<(typeof ORG_CHART_SIXTEEN_ROLE_IDS)[number], string> = {
  coo: "COO（CEO の右腕）",
  cto: "CTO",
  engineering: "エンジニア",
  design_lead: "デザイン統括",
  design: "デザイナー",
  sales_lead: "営業統括",
  sales_outbound: "新規開拓（アウトバウンド）",
  sales_inbound: "新規開拓（インバウンド・提携）",
  customer_success: "カスタマーサクセス",
  marketing_lead: "マーケティング統括",
  social_media: "SNS 担当",
  finance: "経理",
  personal_finance: "個人財務",
  secretary: "秘書",
  legal: "法務",
  security: "セキュリティ統括",
};

/** Agents rendered in org-chart mermaid (catalog `reports_to` edges). */
export const ORG_CHART_MERMAID_AGENT_IDS = [
  "executive_steward",
  ...ORG_CHART_SIXTEEN_ROLE_IDS,
  "contract",
  "compliance",
  "operations",
] as const;

function mermaidNodeLabel(agent: AgentCatalogEntry): string {
  return (agent.name_ja ?? agent.name).replace(/"/g, "'");
}

export function buildOrgChartMermaid(): string {
  const idSet = new Set<string>(ORG_CHART_MERMAID_AGENT_IDS);
  const agents = ORG_CHART_MERMAID_AGENT_IDS.map((id) =>
    listCatalogAgents().find((agent) => agent.id === id)
  ).filter((agent): agent is AgentCatalogEntry => Boolean(agent));

  const lines: string[] = [
    "flowchart TB",
    'CEO["CEO 人間"]',
    "CEO --> executive_steward",
  ];

  for (const agent of agents) {
    lines.push(`${agent.id}["${mermaidNodeLabel(agent)}"]`);
  }

  for (const agent of agents) {
    if (agent.id === "executive_steward" || !agent.reports_to) continue;
    if (!idSet.has(agent.reports_to)) continue;
    lines.push(`${agent.reports_to} --> ${agent.id}`);
  }

  return lines.join("\n");
}

export function buildOrgChartMermaidBlock(): string {
  return `\`\`\`mermaid\n${buildOrgChartMermaid()}\n\`\`\``;
}

function agentMdLink(agent: AgentCatalogEntry): string {
  const file = agent.path.replace(/^steward\/core\/agents\//, "");
  return `[${file}](${file})`;
}

export function buildOrgChartSixteenTable(): string {
  const lines = [
    "| # | 記事の役割 | Agent id | 定義 |",
    "|---|-----------|----------|------|",
  ];
  ORG_CHART_SIXTEEN_ROLE_IDS.forEach((id, index) => {
    const agent = listCatalogAgents().find((a) => a.id === id);
    if (!agent) {
      lines.push(`| ${index + 1} | ${SIXTEEN_ROLE_LABELS[id]} | \`${id}\` | — |`);
      return;
    }
    lines.push(
      `| ${index + 1} | ${SIXTEEN_ROLE_LABELS[id]} | \`${id}\` | ${agentMdLink(agent)} |`
    );
  });
  return lines.join("\n");
}

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

export function buildSkillRegistryIndex(): string {
  const skills = [...loadSkillRegistry()].sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    "| Skill id | runtime | agent_id | CLI | module |",
    "|----------|---------|----------|-----|--------|",
  ];
  for (const skill of skills) {
    const runtime = skill.runtime === "agent" ? "agent" : skill.runtime;
    lines.push(
      `| \`${skill.id}\` | ${runtime} | \`${skill.agent_id}\` | ${skill.cli_command ? `\`${skill.cli_command}\`` : "—"} | ${skill.moduleId ?? "core"} |`
    );
  }
  return lines.join("\n");
}

export function buildSkillDelegationRuntimeNote(): string {
  return [
    "- `runtime: agent` — LLM + Skill 定義添付（旧 `cursor-only` と同義）",
    "- `runtime: cli` — `orgos skills run` で決定論実行",
    "- 実行 Agent の override は `src/lib/skill-execution-mode.ts` が正本",
    "- 標準経路: `resolveSkillExecutionMode` → `orgos route dispatch --mode auto`（authority 一致時のみ direct）",
  ].join("\n");
}

export function buildAgentLabelIndex(): string {
  const lines = [
    "| 表示名 | Agent id |",
    "|--------|----------|",
  ];
  for (const agent of [...listCatalogAgents()].sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`| ${agent.name_ja ?? agent.name} | \`${agent.id}\` |`);
  }
  return lines.join("\n");
}

export function buildExecutingAgentOverrideTable(): string {
  const skills = loadSkillRegistry();
  const lines = [
    "| Skill id | registry agent_id | executing agent_id |",
    "|----------|-------------------|-------------------|",
  ];
  for (const [skillId, agentId] of Object.entries(EXECUTING_AGENT_OVERRIDES).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const skill = skills.find((entry) => entry.id === skillId);
    lines.push(
      `| \`${skillId}\` | \`${skill?.agent_id ?? "—"}\` | \`${agentId}\` |`
    );
  }
  return lines.join("\n");
}

export function buildStewardSelfExecuteTable(): string {
  const lines = [
    "| Skill id | executing agent | Steward の動き |",
    "|----------|-----------------|--------------|",
  ];
  for (const skillId of [...STEWARD_SELF_EXECUTE_SKILLS].sort()) {
    lines.push(
      `| \`${skillId}\` | \`executive_steward\` | Steward **自実行**（CLI）→ 要約読取 |`
    );
  }
  return lines.join("\n");
}

export function buildRoutingSkillIndex(): string {
  const routes = loadRoutingRegistry().routes
    .filter((route) => route.skill)
    .sort((a, b) => a.id.localeCompare(b.id));
  const lines = [
    "| route id | agent id | skill id |",
    "|----------|----------|----------|",
  ];
  for (const route of routes) {
    lines.push(`| ${route.id} | \`${route.agent}\` | \`${route.skill}\` |`);
  }
  return lines.join("\n");
}

export function buildExecutionDecisionTree(): string {
  return [
    "```",
    "Skill id / CLI が指定された",
    "│",
    "├─ resolveSkillExecutionMode()  （src/lib/skill-execution-mode.ts）",
    "│",
    "├─ direct_auto + resolution ready",
    "│     → orgos route dispatch --mode auto（authority 一致 · CLI 直実行）",
    "│",
    "├─ delegate_work_order / agent_interactive / escalate",
    "│     → Work Order（executing agent id へ IMP）",
    "│",
    "├─ deferred",
    "│     → 必須 argv / parent command 不足 — 手動 dispatch",
    "│",
    "├─ human_approval",
    "│     → wire · approval · broker — CEO ゲート",
    "│",
    "└─ skill 不明",
    "      → orgos route match --text · orgos escalate plan",
    "```",
  ].join("\n");
}

export function validateSkillDelegationNarrativeDrift(): string[] {
  const issues: string[] = [];
  const text = readFileSync(SKILL_DELEGATION_MAP_PATH, "utf-8");
  const narrative = text.replace(
    /<!-- orgos:generated:[^>]+ -->[\s\S]*?<!-- orgos:generated:[^>]+ -->/g,
    ""
  );
  if (/cursor-only/i.test(narrative)) {
    issues.push("skill_delegation_map.md: remove cursor-only from narrative; use generated runtime note");
  }
  if (!text.includes("skill-execution-mode.ts")) {
    issues.push("skill_delegation_map.md must reference src/lib/skill-execution-mode.ts as execution SoT");
  }
  const requiredSections = [
    "agent-label-index",
    "executing-agent-overrides",
    "steward-self-execute",
    "routing-skill-index",
    "execution-decision-tree",
    "skill-registry-index",
    "skill-runtime-note",
  ];
  for (const name of requiredSections) {
    if (!text.includes(generatedMarker(name, false))) {
      issues.push(`skill_delegation_map.md: missing generated section ${name}`);
    }
  }
  return issues;
}

export function generatedMarker(name: string, end = false): string {
  return `<!-- ${GENERATED_MARKER_PREFIX}:${name}:${end ? "end" : "start"} -->`;
}

export function replaceGeneratedSection(
  markdown: string,
  name: string,
  generatedBody: string
): string {
  const start = generatedMarker(name, false);
  const end = generatedMarker(name, true);
  const block = `${start}\n${generatedBody.trimEnd()}\n${end}`;
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  );
  if (pattern.test(markdown)) return markdown.replace(pattern, block);
  return `${markdown.trimEnd()}\n\n${block}\n`;
}

export function extractGeneratedSection(markdown: string, name: string): string | undefined {
  const start = generatedMarker(name, false);
  const end = generatedMarker(name, true);
  const pattern = new RegExp(
    `${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n([\\s\\S]*?)\\n${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
  );
  return pattern.exec(markdown)?.[1];
}

export function syncAgentDocs(write = false): { orgChart: string; roster: string; delegation: string } {
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
  delegation = replaceGeneratedSection(delegation, "steward-self-execute", buildStewardSelfExecuteTable());
  delegation = replaceGeneratedSection(delegation, "routing-skill-index", buildRoutingSkillIndex());
  delegation = replaceGeneratedSection(
    delegation,
    "execution-decision-tree",
    buildExecutionDecisionTree()
  );
  delegation = replaceGeneratedSection(delegation, "skill-registry-index", buildSkillRegistryIndex());
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
    ["skill_delegation_map.md", "executing-agent-overrides", buildExecutingAgentOverrideTable(), delegation],
    ["skill_delegation_map.md", "steward-self-execute", buildStewardSelfExecuteTable(), delegation],
    ["skill_delegation_map.md", "routing-skill-index", buildRoutingSkillIndex(), delegation],
    ["skill_delegation_map.md", "execution-decision-tree", buildExecutionDecisionTree(), delegation],
    ["skill_delegation_map.md", "skill-registry-index", buildSkillRegistryIndex(), delegation],
    ["skill_delegation_map.md", "skill-runtime-note", buildSkillDelegationRuntimeNote(), delegation],
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

function extractBacktickIds(markdown: string): string[] {
  const ids = new Set<string>();
  const re = /`([a-z][a-z0-9_]+)`/g;
  for (const match of markdown.matchAll(re)) {
    ids.add(match[1]!);
  }
  return [...ids];
}

export function validateOrgChartDrift(): string[] {
  const issues: string[] = [];
  const text = readFileSync(ORG_CHART_PATH, "utf-8");
  const mentioned = new Set(extractBacktickIds(text));

  for (const id of ORG_CHART_SIXTEEN_ROLE_IDS) {
    if (!mentioned.has(id)) {
      issues.push(`org-chart.md missing curated id: ${id}`);
    }
    if (!resolveAgentId(id)) {
      issues.push(`org-chart curated id not in catalog: ${id}`);
    }
  }

  for (const id of ORG_CHART_SIXTEEN_ROLE_IDS) {
    const agent = listCatalogAgents().find((a) => a.id === id);
    if (!agent) continue;
    const expectedPath = agent.path.replace(/^steward\/core\/agents\//, "");
    if (!text.includes(expectedPath)) {
      issues.push(`org-chart.md missing path link for ${id}: ${expectedPath}`);
    }
  }

  if (!text.includes("registry.yaml")) {
    issues.push("org-chart.md must declare registry.yaml as canonical source");
  }
  return issues;
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

export function validateAgentDocsDrift(): string[] {
  return [
    ...validateOrgChartDrift(),
    ...validateStewardRosterDrift(),
    ...validateSkillDelegationNarrativeDrift(),
    ...validateAgentDocsGeneratedDrift(),
  ];
}
