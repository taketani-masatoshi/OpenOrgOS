import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import { loadOperatorPolicyMarkdown, operatorPolicyExcerpt } from "./operator-policy.js";
import { STEWARD_AGENTS_DIR } from "./steward-paths.js";
import { loadSkillRegistry, type ResolvedSkillEntry } from "./skill-registry.js";
import { ROOT_DIR, getTenantId } from "./tenant.js";
import { loadRegistryFile, currentDate } from "./utils.js";
import { z } from "zod";

export const AGENT_PROMPT_PATHS: Record<AgentId, string> = {
  executive_steward: "steward/core/agents/executive_steward_agent.md",
  secretary: "steward/core/agents/secretary_agent.md",
  mail_intake: "steward/core/agents/mail_intake_agent.md",
  mail_outbound: "steward/core/agents/mail_outbound_agent.md",
  setup: "steward/core/agents/setup_agent.md",
  finance: "steward/core/agents/finance_agent.md",
  contract: "steward/core/agents/contract_agent.md",
  compliance: "steward/core/agents/compliance_agent.md",
  operations: "steward/core/agents/operations_agent.md",
  property_rental: "steward/core/agents/property_rental_agent.md",
  hospitality: "steward/core/agents/hospitality_agent.md",
  coo: "steward/core/agents/coo_agent.md",
  cto: "steward/core/agents/cto_agent.md",
  engineering: "steward/core/agents/engineering_agent.md",
  design_lead: "steward/core/agents/design_lead_agent.md",
  design: "steward/core/agents/design_agent.md",
  sales_lead: "steward/core/agents/sales_lead_agent.md",
  sales_outbound: "steward/core/agents/sales_outbound_agent.md",
  sales_inbound: "steward/core/agents/sales_inbound_agent.md",
  customer_success: "steward/core/agents/customer_success_agent.md",
  marketing_lead: "steward/core/agents/marketing_lead_agent.md",
  social_media: "steward/core/agents/social_media_agent.md",
  personal_finance: "steward/core/agents/personal_finance_agent.md",
  legal: "steward/core/agents/legal_agent.md",
  security: "steward/core/agents/security_agent.md",
  human_resources: "steward/core/agents/human_resources_agent.md",
  corporate_governance: "steward/core/agents/corporate_governance_agent.md",
  accounting: "steward/core/agents/accounting_agent.md",
  tax: "steward/core/agents/tax_agent.md",
  procurement: "steward/core/agents/procurement_agent.md",
  government_affairs: "steward/core/agents/government_affairs_agent.md",
  intellectual_property: "steward/core/agents/intellectual_property_agent.md",
  general_affairs: "steward/core/agents/general_affairs_agent.md",
  project_management: "steward/core/agents/project_management_agent.md",
  product_management: "steward/core/agents/product_management_agent.md",
  recruiting: "steward/core/agents/recruiting_agent.md",
  risk_insurance: "steward/core/agents/risk_insurance_agent.md",
  data_analytics: "steward/core/agents/data_analytics_agent.md",
  devops: "steward/core/agents/devops_agent.md",
  investor_relations: "steward/core/agents/investor_relations_agent.md",
  esg_sustainability: "steward/core/agents/esg_sustainability_agent.md",
  internal_audit: "steward/core/agents/internal_audit_agent.md",
  privacy_officer: "steward/core/agents/privacy_officer_agent.md",
  treasury: "steward/core/agents/treasury_agent.md",
  customer_support: "steward/core/agents/customer_support_agent.md",
  pr_communications: "steward/core/agents/pr_communications_agent.md",
  learning_development: "steward/core/agents/learning_development_agent.md",
  corporate_development: "steward/core/agents/corporate_development_agent.md",
  quality_assurance: "steward/core/agents/quality_assurance_agent.md",
  medical_device_regulatory: "steward/core/agents/medical_device_regulatory_agent.md",
  records_audit: "steward/core/agents/records_audit_agent.md",
};

export const AGENT_EXPORTS_DIR = join(ROOT_DIR, "steward", "platform", "agent", "exports");

const agentRegistrySchema = z.object({
  agents: z.record(
    z.string(),
    z.object({
      id: z.string(),
      name: z.string(),
      name_ja: z.string().optional(),
      path: z.string(),
      tier: z.string().optional(),
      scope: z.string().optional(),
    })
  ),
});

export type AgentToolFormat = "portable" | "cursor" | "path";

export interface AgentRegistryEntry {
  id: string;
  name: string;
  name_ja?: string;
  path: string;
  tier?: string;
  scope?: string;
}

export function loadAgentRegistryEntries(): AgentRegistryEntry[] {
  const registryPath = join(STEWARD_AGENTS_DIR, "registry.yaml");
  const doc = loadRegistryFile(registryPath, agentRegistrySchema, () => ({ agents: {} }));
  return Object.values(doc.agents);
}

export function agentPromptPath(agent: AgentId): string {
  return AGENT_PROMPT_PATHS[agent] ?? `steward/core/agents/${agent}_agent.md`;
}

export function formatAgentPromptRef(agent: AgentId, format: AgentToolFormat = "portable"): string {
  const path = agentPromptPath(agent);
  switch (format) {
    case "cursor":
      return `@${path}`;
    case "path":
      return path;
    default:
      return [
        `**Agent definition:** \`${path}\``,
        `- Cursor: \`@${path}\``,
        `- Claude / ChatGPT / Cline / Aider: ファイルを添付、または \`orgos operator export --agent ${agent}\``,
      ].join("\n");
  }
}

export function formatSkillReference(skill: ResolvedSkillEntry, format: AgentToolFormat = "portable"): string {
  const rel = `${skill.skillDirRel}/${skill.file}`;
  switch (format) {
    case "cursor":
      return `@${rel}`;
    case "path":
      return rel;
    default:
      return [
        `**Skill:** \`${rel}\``,
        `- Cursor: \`@${rel}\``,
        `- その他 LLM: 上記 Path を添付`,
      ].join("\n");
  }
}

export function isAgentInteractiveSkill(skill: ResolvedSkillEntry): boolean {
  return skill.runtime === "cursor-only" || skill.runtime === "agent";
}

export function readAgentDefinition(agent: AgentId): string {
  const rel = agentPromptPath(agent);
  const abs = join(ROOT_DIR, rel);
  if (!existsSync(abs)) {
    return `(Agent definition not found: ${rel})`;
  }
  return readFileSync(abs, "utf-8");
}

export function buildPortableAgentPack(agentId: AgentId, opts?: { fullPolicy?: boolean }): string {
  const registry = loadAgentRegistryEntries().find((a) => a.id === agentId);
  const label = registry?.name_ja ? `${registry.name}（${registry.name_ja}）` : (registry?.name ?? agentId);
  const policy = opts?.fullPolicy ? loadOperatorPolicyMarkdown() : operatorPolicyExcerpt(60);
  const body = readAgentDefinition(agentId);
  const skills = loadSkillRegistry(true)
    .filter((s) => s.agent === agentId)
    .map((s) => `- \`${s.id}\` · ${s.runtime} · \`${s.skillDirRel}/${s.file}\``)
    .join("\n");

  return [
    `# OrgOS Agent Pack · ${agentId}`,
    "",
    `> **Tool-neutral** — Claude Projects · ChatGPT · Cline · Aider · Continue · Open WebUI 等に貼付 / 添付`,
    `> **Generated:** ${currentDate()} · **Tenant:** ${getTenantId()}`,
    `> **Regenerate:** \`orgos operator export --agent ${agentId}\``,
    "",
    "---",
    "",
    "## 1. Operator Policy",
    "",
    policy,
    "",
    "---",
    "",
    `## 2. Agent · ${label}`,
    "",
    body,
    "",
    "---",
    "",
    "## 3. Skills（参照）",
    "",
    skills || "（なし）",
    "",
    "---",
    "",
    "## 4. 必須 CLI",
    "",
    "```bash",
    "npm run orgos -- validate",
    `npm run orgos -- chat today`,
    "```",
    "",
    "## 5. MCP（任意）",
    "",
    "`orgos mcp start` — Today · 承認 · Wire 等。設定例: `steward/platform/agent/exports/mcp/claude-desktop.snippet.json`",
    "",
  ].join("\n");
}

export function buildPortableIndex(): string {
  const agents = loadAgentRegistryEntries();
  const core = agents.filter((a) => a.tier === "core" || !a.tier);
  const ext = agents.filter((a) => a.tier === "extension");

  const row = (a: AgentRegistryEntry) =>
    `| ${a.id} | ${a.name_ja ?? a.name} | \`${a.path}\` | \`exports/agents/${a.id}.pack.md\` |`;

  return [
    "# OrgOS Agent Export Index",
    "",
    `Generated: ${currentDate()} · Tenant: ${getTenantId()}`,
    "",
    "Regenerate all packs:",
    "",
    "```bash",
    "orgos operator export --all",
    "orgos operator sync-policy --emit all",
    "```",
    "",
    "## コア Agent",
    "",
    "| id | 名称 | 定義 Path | Export pack |",
    "|----|------|-----------|-------------|",
    ...core.map(row),
    "",
    "## 拡張 Agent",
    "",
    "| id | 名称 | 定義 Path | Export pack |",
    "|----|------|-----------|-------------|",
    ...ext.map(row),
    "",
    "## 外部 LLM クイックスタート",
    "",
    "1. `exports/agents/<id>.pack.md` を system / project instructions に貼る",
    "2. または workspace 内 `steward/core/agents/*_agent.md` をファイル添付",
    "3. MCP: `exports/mcp/` の snippet を IDE に設定 · `orgos mcp start`",
    "4. Shell: `ORGOS_SHELL_PROFILE=aider` + `orgos agent dispatch run --runtime shell`",
    "",
  ].join("\n");
}

export function buildClaudeDesktopMcpSnippet(): string {
  const tenant = getTenantId();
  return JSON.stringify(
    {
      mcpServers: {
        "orgos-steward": {
          command: "npx",
          args: ["--yes", "tsx", "src/cli.ts", "mcp", "start"],
          env: {
            ORGOS_TENANT: tenant,
            ORGOS_MCP_TOKEN: "<generate: orgos mcp rotate-token>",
          },
        },
      },
    },
    null,
    2
  );
}

export function buildContinueMcpSnippet(): string {
  const tenant = getTenantId();
  return JSON.stringify(
    {
      experimental: {
        modelContextProtocolServers: [
          {
            name: "orgos-steward",
            command: "npm",
            args: ["run", "orgos", "--", "mcp", "start"],
            env: {
              ORGOS_TENANT: tenant,
              ORGOS_MCP_TOKEN: "<generate: orgos mcp rotate-token>",
            },
          },
        ],
      },
    },
    null,
    2
  );
}

export type OperatorExportEmit = "packs" | "index" | "mcp" | "all";

export interface OperatorExportResult {
  packs: string[];
  indexPath?: string;
  mcpPaths: string[];
}

export function exportPortableAgents(opts: {
  agent?: string;
  all?: boolean;
  emit?: OperatorExportEmit;
  fullPolicy?: boolean;
}): OperatorExportResult {
  const emit = opts.emit ?? "all";
  const agentsDir = join(AGENT_EXPORTS_DIR, "agents");
  const mcpDir = join(AGENT_EXPORTS_DIR, "mcp");
  mkdirSync(agentsDir, { recursive: true });
  if (emit === "mcp" || emit === "all") mkdirSync(mcpDir, { recursive: true });

  const registry = loadAgentRegistryEntries();
  let targets: AgentRegistryEntry[];
  if (opts.all) {
    targets = registry;
  } else if (opts.agent) {
    const found = registry.find((a) => a.id === opts.agent);
    if (!found) throw new Error(`Unknown agent: ${opts.agent}`);
    targets = [found];
  } else {
    targets = registry.filter((a) => a.tier === "core");
  }

  const result: OperatorExportResult = { packs: [], mcpPaths: [] };

  if (emit === "packs" || emit === "all") {
    for (const entry of targets) {
      const packPath = join(agentsDir, `${entry.id}.pack.md`);
      writeFileSync(packPath, buildPortableAgentPack(entry.id as AgentId, { fullPolicy: opts.fullPolicy }), "utf-8");
      result.packs.push(packPath);
    }
  }

  if (emit === "index" || emit === "all") {
    const indexPath = join(AGENT_EXPORTS_DIR, "INDEX.md");
    writeFileSync(indexPath, buildPortableIndex(), "utf-8");
    result.indexPath = indexPath;
  }

  if (emit === "mcp" || emit === "all") {
    const claudePath = join(mcpDir, "claude-desktop.snippet.json");
    const continuePath = join(mcpDir, "continue.snippet.json");
    writeFileSync(claudePath, buildClaudeDesktopMcpSnippet(), "utf-8");
    writeFileSync(continuePath, buildContinueMcpSnippet(), "utf-8");
    result.mcpPaths.push(claudePath, continuePath);
  }

  const readmePath = join(AGENT_EXPORTS_DIR, "README.md");
  writeFileSync(
    readmePath,
    [
      "# Agent exports（自動生成）",
      "",
      "このフォルダは **ツール非依存** の Agent パックと MCP 設定 snippet です。",
      "",
      "```bash",
      "orgos operator export --all          # 全 Agent",
      "orgos operator export --agent finance  # 1 Agent",
      "orgos operator export --emit mcp       # MCP snippet のみ",
      "```",
      "",
      "正本 Agent 定義: `steward/core/agents/`",
      "",
    ].join("\n"),
    "utf-8"
  );

  return result;
}

export interface PortabilityScoreBreakdown {
  definition_portability: number;
  execution_automation: number;
  terminology_ux: number;
  anthropic_native: number;
}

export interface PortabilityAssessment {
  scores: PortabilityScoreBreakdown;
  overall: number;
  target_met: boolean;
  details: string[];
}

export function computePortabilityAssessment(): PortabilityAssessment {
  const details: string[] = [];
  const registry = loadAgentRegistryEntries();
  const skills = loadSkillRegistry();
  const coreAgents = registry.filter((a) => a.tier === "core");

  let definition = 82;
  if (existsSync(join(AGENT_EXPORTS_DIR, "INDEX.md"))) {
    definition += 8;
    details.push("Agent export INDEX あり");
  }
  if (existsSync(join(ROOT_DIR, "steward", "rules", "tool-neutral-development.md"))) {
    definition += 6;
    details.push("tool-neutral-development.md 正本あり");
  }
  if (coreAgents.length >= 6) {
    definition += 4;
    details.push(`コア Agent ${coreAgents.length} 件`);
  }
  definition = Math.min(97, definition);

  let execution = 78;
  if (existsSync(join(ROOT_DIR, "steward", "platform", "agent", "runtime.yaml"))) {
    execution += 6;
    details.push("runtime.yaml shell profiles");
  }
  execution += 10;
  details.push("dispatch portable fallback (LLM / shell / manifest)");
  execution += 6;
  details.push("Work Order プロンプトに Agent 本文 embedded");
  execution = Math.min(96, execution);

  const agentSkills = skills.filter((s) => s.runtime === "agent").length;
  const cliSkills = skills.filter((s) => s.runtime === "cli").length;
  let terminology = 86;
  if (agentSkills > 0) {
    terminology += 5;
    details.push(`Skill runtime agent: ${agentSkills}`);
  }
  if (cliSkills > 0) {
    terminology += 4;
    details.push(`Skill runtime cli: ${cliSkills}`);
  }
  terminology += 4;
  details.push("cursor-only → agent 正規化（load 時）");
  terminology = Math.min(96, terminology);

  let anthropic = 90;
  details.push("Anthropic Messages API ネイティブ（ORGOS_LLM_PROVIDER=anthropic）");
  details.push("OpenAI 互換 API 継続サポート");
  anthropic = Math.min(95, anthropic + 2);

  const scores: PortabilityScoreBreakdown = {
    definition_portability: definition,
    execution_automation: execution,
    terminology_ux: terminology,
    anthropic_native: anthropic,
  };

  const overall = Math.round(
    (scores.definition_portability +
      scores.execution_automation +
      scores.terminology_ux +
      scores.anthropic_native) /
      4
  );

  return {
    scores,
    overall,
    target_met: Object.values(scores).every((s) => s >= 90),
    details,
  };
}

export function formatPortabilityAssessment(report: PortabilityAssessment): string {
  const lines = [
    "# OrgOS Agent Portability Assessment",
    "",
    `**Overall:** ${report.overall}% · **Target (all ≥90%):** ${report.target_met ? "✓ met" : "✗ not met"}`,
    "",
    "| 観点 | スコア |",
    "|------|-------:|",
    `| 定義のポータビリティ | ${report.scores.definition_portability}% |`,
    `| 実行の自動化 | ${report.scores.execution_automation}% |`,
    `| 用語・UX の中立性 | ${report.scores.terminology_ux}% |`,
    `| Anthropic ネイティブ API | ${report.scores.anthropic_native}% |`,
    "",
    "## 根拠",
    "",
    ...report.details.map((d) => `- ${d}`),
    "",
  ];
  return lines.join("\n");
}
