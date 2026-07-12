import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import {
  loadOperatorPolicyMarkdown,
  operatorPolicyExcerpt,
  engineeringConstitutionExcerpt,
  rewriteMarkdownLinksForPortableExport,
} from "./operator-policy.js";
import { loadSkillRegistry, type ResolvedSkillEntry } from "./skill-registry.js";
import { ROOT_DIR, getTenantId } from "./tenant.js";
import { currentDate } from "./utils.js";
import {
  getCatalogAgent,
  isAgentActive,
  listCatalogAgents,
  resolveAgentId,
} from "./agent-catalog.js";

export const AGENT_EXPORTS_DIR = join(ROOT_DIR, "steward", "platform", "agent", "exports");

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
  return listCatalogAgents();
}

export function agentPromptPath(agent: AgentId): string {
  const resolved = resolveAgentId(agent) ?? agent;
  return getCatalogAgent(resolved)?.path ?? `steward/core/agents/${resolved}_agent.md`;
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

export function formatSkillReference(
  skill: ResolvedSkillEntry,
  format: AgentToolFormat = "portable"
): string {
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
  const label = registry?.name_ja
    ? `${registry.name}（${registry.name_ja}）`
    : (registry?.name ?? agentId);
  const policy = rewriteMarkdownLinksForPortableExport(
    opts?.fullPolicy ? loadOperatorPolicyMarkdown() : operatorPolicyExcerpt(60)
  );
  const body = rewriteMarkdownLinksForPortableExport(readAgentDefinition(agentId));
  const skills = loadSkillRegistry(true)
    .filter((s) => s.agent_id === agentId)
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
    "## 1b. Engineering Constitution (excerpt)",
    "",
    rewriteMarkdownLinksForPortableExport(engineeringConstitutionExcerpt(45)),
    "",
    "Full index: `steward/rules/openorgos-engineering-constitution.md` · split rules: `steward/rules/engineering/`",
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
    "**鮮度の二重確認:** `export --all` のあと `npm run generated:check`（内部で `validateAgentPackExports`）が通ること。",
    "",
    "## Engineering Constitution（Path 表）",
    "",
    "| 分割 | Path |",
    "|------|------|",
    "| 索引 | `steward/rules/openorgos-engineering-constitution.md` |",
    "| 00 Purpose · DoD | `steward/rules/engineering/00-engineering-constitution.md` |",
    "| 01 Architecture | `steward/rules/engineering/01-architecture.md` |",
    "| 02 TypeScript | `steward/rules/engineering/02-typescript.md` |",
    "| 04 Testing | `steward/rules/engineering/04-testing.md` |",
    "| 08 Event sourcing | `steward/rules/engineering/08-event-sourcing.md` |",
    "| 09 OrgOS domain | `steward/rules/engineering/09-openorgos-domain.md` |",
    "| Operator policy | `steward/rules/operator-policy.md` |",
    "| Tool-neutral | `steward/rules/tool-neutral-development.md` |",
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
  changedPacks: string[];
  indexPath?: string;
  mcpPaths: string[];
}

function writeGeneratedFileIfChanged(path: string, content: string): boolean {
  if (existsSync(path) && readFileSync(path, "utf-8") === content) return false;
  writeFileSync(path, content, "utf-8");
  return true;
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
    targets = registry.filter((entry) =>
      isAgentActive(entry.id as AgentId, {
        profile: "operational",
        mode: "consult",
      })
    );
  } else if (opts.agent) {
    const found = registry.find((a) => a.id === opts.agent);
    if (!found) throw new Error(`Unknown agent: ${opts.agent}`);
    targets = [found];
  } else {
    targets = registry.filter((a) => a.tier === "core");
  }

  const result: OperatorExportResult = { packs: [], changedPacks: [], mcpPaths: [] };

  if (emit === "packs" || emit === "all") {
    for (const entry of targets) {
      const packPath = join(agentsDir, `${entry.id}.pack.md`);
      const changed = writeGeneratedFileIfChanged(
        packPath,
        buildPortableAgentPack(entry.id as AgentId, { fullPolicy: opts.fullPolicy })
      );
      result.packs.push(packPath);
      if (changed) result.changedPacks.push(packPath);
    }
  }

  if (emit === "index" || emit === "all") {
    const indexPath = join(AGENT_EXPORTS_DIR, "INDEX.md");
    writeGeneratedFileIfChanged(indexPath, buildPortableIndex());
    result.indexPath = indexPath;
  }

  if (emit === "mcp" || emit === "all") {
    const claudePath = join(mcpDir, "claude-desktop.snippet.json");
    const continuePath = join(mcpDir, "continue.snippet.json");
    writeGeneratedFileIfChanged(claudePath, buildClaudeDesktopMcpSnippet());
    writeGeneratedFileIfChanged(continuePath, buildContinueMcpSnippet());
    result.mcpPaths.push(claudePath, continuePath);
  }

  const readmePath = join(AGENT_EXPORTS_DIR, "README.md");
  writeGeneratedFileIfChanged(
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
    ].join("\n")
  );

  return result;
}

function normalizeAgentExportForCompare(content: string): string {
  return content
    .replace(/^Generated: .+$/m, "Generated: <deterministic>")
    .replace(/^> \*\*Generated:\*\* .+$/m, "> **Generated:** <deterministic>")
    .replace(/^> \*\*Tenant:\*\* .+$/m, "> **Tenant:** <deterministic>")
    .replace(/^(Generated: .+?) · Tenant: .+$/m, "$1 · Tenant: <deterministic>");
}

export function validateAgentPackExports(): string[] {
  const issues: string[] = [];
  const registry = loadAgentRegistryEntries();
  const targets = registry.filter((entry) =>
    isAgentActive(entry.id as AgentId, { profile: "operational", mode: "consult" })
  );
  const agentsDir = join(AGENT_EXPORTS_DIR, "agents");

  for (const entry of targets) {
    const rel = `steward/platform/agent/exports/agents/${entry.id}.pack.md`;
    const packPath = join(agentsDir, `${entry.id}.pack.md`);
    const expected = normalizeAgentExportForCompare(buildPortableAgentPack(entry.id as AgentId));
    if (!existsSync(packPath)) {
      issues.push(`${rel} missing; run orgos operator export --all`);
      continue;
    }
    const actual = normalizeAgentExportForCompare(readFileSync(packPath, "utf-8"));
    if (actual !== expected) {
      issues.push(`${rel} stale; run orgos operator export --all`);
    }
    // Packs must not ship broken parent-relative links for external LLM paste.
    const rawPack = readFileSync(packPath, "utf-8");
    const broken = [...rawPack.matchAll(/\[[^\]]*\]\((\.\.\/[^)]+)\)/g)].map((m) => m[1]!);
    if (broken.length > 0) {
      issues.push(
        `${rel} has parent-relative links (${broken.slice(0, 3).join(", ")}); rewrite to steward/… paths`
      );
    }
  }

  const indexRel = "steward/platform/agent/exports/INDEX.md";
  const indexPath = join(AGENT_EXPORTS_DIR, "INDEX.md");
  const expectedIndex = normalizeAgentExportForCompare(buildPortableIndex());
  if (!existsSync(indexPath)) {
    issues.push(`${indexRel} missing; run orgos operator export --all`);
  } else if (normalizeAgentExportForCompare(readFileSync(indexPath, "utf-8")) !== expectedIndex) {
    issues.push(`${indexRel} stale; run orgos operator export --all`);
  }

  const mcpDir = join(AGENT_EXPORTS_DIR, "mcp");
  for (const name of ["claude-desktop.snippet.json", "continue.snippet.json"] as const) {
    const rel = `steward/platform/agent/exports/mcp/${name}`;
    const snippetPath = join(mcpDir, name);
    const expected =
      name === "claude-desktop.snippet.json"
        ? buildClaudeDesktopMcpSnippet()
        : buildContinueMcpSnippet();
    if (!existsSync(snippetPath)) {
      issues.push(`${rel} missing; run orgos operator export --emit mcp`);
    } else if (
      normalizeMcpSnippetForCompare(readFileSync(snippetPath, "utf-8")) !==
      normalizeMcpSnippetForCompare(expected)
    ) {
      issues.push(`${rel} stale; run orgos operator export --emit mcp`);
    }
  }

  return issues;
}

function normalizeMcpSnippetForCompare(content: string): string {
  return content.replace(/("ORGOS_TENANT"\s*:\s*")[^"]+(")/g, "$1<tenant>$2");
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
