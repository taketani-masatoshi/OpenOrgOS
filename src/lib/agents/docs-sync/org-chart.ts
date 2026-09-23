import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentCatalogEntry } from "../../../../schemas/agent-catalog.js";
import { listCatalogAgents, resolveAgentId } from "../../agent-catalog.js";
import { ROOT_DIR } from "../../tenant.js";

export const ORG_CHART_PATH = join(ROOT_DIR, "steward/core/agents/org-chart.md");

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

export function agentMdLink(agent: AgentCatalogEntry): string {
  const file = agent.path.replace(/^steward\/core\/agents\//, "");
  return `[${file}](${file})`;
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
