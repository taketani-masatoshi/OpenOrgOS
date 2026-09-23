import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../../../schemas/classification.js";
import {
  loadOperatorPolicyMarkdown,
  operatorPolicyExcerpt,
  engineeringConstitutionExcerpt,
  localLlmErrorFallbackExcerpt,
  rewriteMarkdownLinksForPortableExport,
} from "../../operator-policy.js";
import { loadSkillRegistry } from "../../skill-registry.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";
import { isAgentActive } from "../../agent-catalog.js";
import {
  AGENT_EXPORTS_DIR,
  loadAgentRegistryEntries,
  readAgentDefinition,
  type AgentRegistryEntry,
} from "./prompt-ref.js";
import { buildClaudeDesktopMcpSnippet, buildContinueMcpSnippet } from "./mcp-snippets.js";

export function buildPortableAgentPack(agentId: AgentId, opts?: { fullPolicy?: boolean }): string {
  const registry = loadAgentRegistryEntries().find((a) => a.id === agentId);
  const label = registry?.name_ja ? `${registry.name}（${registry.name_ja}）` : (registry?.name ?? agentId);
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
    "## 1c. Local LLM ERROR fallback (excerpt)",
    "",
    rewriteMarkdownLinksForPortableExport(localLlmErrorFallbackExcerpt(28)),
    "",
    "Full rule: `steward/rules/local-llm-error-fallback.md` · ADR 0061",
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

function normalizeAgentExportForCompare(content: string): string {
  return content
    .replace(/^Generated: .+$/m, "Generated: <deterministic>")
    .replace(/^> \*\*Generated:\*\* .+$/m, "> **Generated:** <deterministic>");
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
    const expected = normalizeAgentExportForCompare(
      buildPortableAgentPack(entry.id as AgentId)
    );
    if (!existsSync(packPath)) {
      issues.push(`${rel} missing; run orgos operator export --all`);
      continue;
    }
    const actual = normalizeAgentExportForCompare(readFileSync(packPath, "utf-8"));
    if (actual !== expected) {
      issues.push(`${rel} stale; run orgos operator export --all`);
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
    } else if (readFileSync(snippetPath, "utf-8") !== expected) {
      issues.push(`${rel} stale; run orgos operator export --emit mcp`);
    }
  }

  return issues;
}
