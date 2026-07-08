import { existsSync } from "node:fs";
import type { AgentId } from "../../schemas/classification.js";
import {
  agentSummarySlug,
  getAgentCapability,
  listAgentCapabilities,
} from "./agent-capability.js";
import { computeAgentReadiness } from "./agent-readiness.js";
import { relayPulseReport } from "./agent-reporting.js";
import { currentDate, resolveTenantPath, writeMarkdownReport } from "./utils.js";

function checkPath(rel: string): { ok: boolean; detail: string } {
  const normalized = rel.replace(/\/$/, "");
  try {
    const ok = existsSync(resolveTenantPath(normalized));
    return { ok, detail: ok ? "OK" : "missing" };
  } catch {
    return { ok: false, detail: "unresolved" };
  }
}

export function formatAgentPulseMarkdown(agentId: AgentId): string {
  const cap = getAgentCapability(agentId);
  const readiness = computeAgentReadiness(agentId);
  const slug = cap?.summary_slug ?? agentSummarySlug(agentId);
  const paths = [...(cap?.data_paths ?? []), ...(cap?.docs_paths ?? [])];
  const pathRows = paths.map((p) => {
    const c = checkPath(p);
    return `| \`${p}\` | ${c.detail} |`;
  });

  return [
    `# ${agentId} Agent 要約 ${currentDate()}`,
    "",
    "## 結論",
    "",
    `- **完成度:** ${readiness.pct}%（readiness 自動評価）`,
    `- **担当パス:** ${paths.length} 件（下表）`,
    ...(readiness.gaps.length
      ? readiness.gaps.slice(0, 5).map((g) => `- ギャップ: ${g}`)
      : ["- ギャップなし（80% 以上）"]),
    "",
    "## Primary パス",
    "",
    "| パス | 状態 |",
    "|------|------|",
    ...(pathRows.length ? pathRows : ["| — | 未定義 |"]),
    "",
    "## 推奨 CLI",
    "",
    "```bash",
    `orgos agent pulse --agent ${agentId}`,
    `orgos agent readiness --agent ${agentId}`,
    cap?.route_ids.length
      ? `orgos route match --text "（${agentId} 担当）"`
      : "# routing 参照: steward/core/routing/registry.yaml",
    "```",
    "",
    "## 根拠",
    "",
    `- [${agentId}_agent.md](../../../steward/core/agents/${agentId}_agent.md)`,
    "- [agent-capability-manifest.yaml](../../../steward/core/agents/agent-capability-manifest.yaml)",
    "",
    `*生成: orgos agent pulse · ${new Date().toISOString()}*`,
  ].join("\n");
}

export function runAgentPulse(agentId: AgentId, opts: { suffix?: string } = {}): string {
  const slug = agentSummarySlug(agentId);
  const md = formatAgentPulseMarkdown(agentId);
  const filename = `${currentDate()}-${opts.suffix ?? "pulse"}.md`;
  const path = writeMarkdownReport(`agent-summaries/${slug}`, filename, md);
  relayPulseReport(agentId, path);
  return path;
}

export function runAllAgentPulses(opts: { suffix?: string } = {}): string[] {
  const paths: string[] = [];
  for (const cap of listAgentCapabilities()) {
    paths.push(runAgentPulse(cap.id, opts));
  }
  return paths;
}

const CORE_DEDICATED_SUMMARY = new Set<AgentId>([
  "executive_steward",
  "finance",
  "contract",
  "compliance",
  "operations",
]);

/** Pulse summaries for extension agents (core keeps dedicated dashboard formatters). */
export function runExtensionAgentPulses(opts: { suffix?: string } = {}): string[] {
  const paths: string[] = [];
  for (const cap of listAgentCapabilities()) {
    if (CORE_DEDICATED_SUMMARY.has(cap.id)) continue;
    paths.push(runAgentPulse(cap.id, opts));
  }
  return paths;
}
