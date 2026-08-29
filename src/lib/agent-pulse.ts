import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AgentId } from "../../schemas/classification.js";
import type { AgentPulseCheck } from "../../schemas/agent-capability.js";
import {
  agentSummarySlug,
  getAgentCapability,
} from "./agent-capability.js";
import { getCatalogAgent, isAgentActive } from "./agent-catalog.js";
import { listActiveTenantAgents } from "./agent-roster.js";
import { computeAgentReadiness } from "./agent-readiness.js";
import { relayPulseReport } from "./agent-reporting.js";
import { formatTaxFilingGapsBriefLines } from "./finance/tax-filing-gaps.js";
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

function newestFileMtimeMs(dirRel: string): number | undefined {
  const dir = resolveTenantPath(dirRel.replace(/\/$/, ""));
  if (!existsSync(dir)) return undefined;
  let newest = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const st = statSync(join(dir, name));
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  }
  return newest || undefined;
}

function checkFreshness(pathRel: string, maxAgeDays: number): { ok: boolean; detail: string } {
  const normalized = pathRel.replace(/\/$/, "");
  const abs = resolveTenantPath(normalized);
  if (!existsSync(abs)) {
    return { ok: false, detail: "missing" };
  }

  let mtimeMs: number | undefined;
  try {
    const st = statSync(abs);
    if (st.isDirectory()) {
      mtimeMs = newestFileMtimeMs(normalized);
    } else {
      mtimeMs = st.mtimeMs;
    }
  } catch {
    return { ok: false, detail: "unresolved" };
  }

  if (!mtimeMs) {
    return { ok: false, detail: "no files" };
  }

  const ageDays = (Date.now() - mtimeMs) / 86_400_000;
  const ok = ageDays <= maxAgeDays;
  const ageLabel = ageDays < 1 ? "<1d" : `${Math.floor(ageDays)}d`;
  return {
    ok,
    detail: ok ? `fresh (${ageLabel})` : `stale (${ageLabel} > ${maxAgeDays}d)`,
  };
}

function runPulseCheck(check: AgentPulseCheck): { ok: boolean; detail: string; label: string } {
  if (check.type === "path_exists" || check.type === "file_exists") {
    const c = checkPath(check.path);
    return { ok: c.ok, detail: check.detail ?? c.detail, label: check.path };
  }
  if (check.type === "freshness") {
    const c = checkFreshness(check.path, check.max_age_days);
    return { ok: c.ok, detail: check.detail ?? c.detail, label: check.path };
  }
  return { ok: true, detail: check.detail ?? "hint", label: "cli" };
}

export function evaluateAgentPulseChecks(agentId: AgentId): {
  ok: number;
  total: number;
  stale: string[];
} {
  const cap = getAgentCapability(agentId);
  const checks = cap?.pulse_checks ?? [];
  if (checks.length === 0) {
    return { ok: 0, total: 0, stale: [] };
  }
  let ok = 0;
  const stale: string[] = [];
  for (const check of checks) {
    const result = runPulseCheck(check);
    if (result.ok) ok += 1;
    else stale.push(`${result.label}: ${result.detail}`);
  }
  return { ok, total: checks.length, stale };
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

  const pulseRows = (cap?.pulse_checks ?? []).map((check) => {
    const result = runPulseCheck(check);
    return `| ${check.type} · \`${result.label}\` | ${result.detail} |`;
  });

  const staleChecks = (cap?.pulse_checks ?? []).filter((c) => !runPulseCheck(c).ok);

  const taxGapLines =
    agentId === "tax" ? formatTaxFilingGapsBriefLines(null, 5) : [];

  return [
    `# ${agentId} Agent 要約 ${currentDate()}`,
    "",
    "## 結論",
    "",
    `- **完成度:** ${readiness.pct}%（readiness 自動評価）`,
    `- **担当パス:** ${paths.length} 件（下表）`,
    ...(staleChecks.length
      ? staleChecks.map((c) => {
          const r = runPulseCheck(c);
          return `- **鮮度:** \`${"path" in c ? c.path : "cli"}\` — ${r.detail}`;
        })
      : ["- **鮮度:** すべて OK"]),
    ...(readiness.gaps.length
      ? readiness.gaps.slice(0, 5).map((g) => `- ギャップ: ${g}`)
      : ["- ギャップなし（80% 以上）"]),
    ...(taxGapLines.length
      ? ["", "## 申告準備ギャップ", "", ...taxGapLines.map((l) => (l.startsWith("- ") ? l : `- ${l}`)), ""]
      : []),
    "",
    "## Primary パス",
    "",
    "| パス | 状態 |",
    "|------|------|",
    ...(pathRows.length ? pathRows : ["| — | 未定義 |"]),
    "",
    ...(pulseRows.length
      ? [
          "## Pulse チェック",
          "",
          "| チェック | 状態 |",
          "|----------|------|",
          ...pulseRows,
          "",
        ]
      : []),
    "## 推奨 CLI",
    "",
    "```bash",
    `orgos agent pulse --agent ${agentId}`,
    `orgos agent readiness --agent ${agentId}`,
    ...(agentId === "records_audit"
      ? [
          "orgos events chain verify",
          "orgos events chain attest",
          "orgos events audit monthly",
        ]
      : []),
    ...(agentId === "accounting" || agentId === "treasury"
      ? [
          "orgos jp bank cashflow generate --granularity weekly --write",
          "orgos jp bank position show",
        ]
      : []),
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

function shouldAutoPulse(agentId: AgentId): boolean {
  const agent = getCatalogAgent(agentId);
  if (!agent) return true;
  if (agent.class === "advisor") return false;
  if (!isAgentActive(agentId, { profile: "operational", mode: "consult" })) return false;
  return agent.auto_pulse !== false;
}

export function listPulseEligibleAgents(): AgentId[] {
  return listActiveTenantAgents("operational").filter((id) => shouldAutoPulse(id));
}

export function runAllAgentPulses(opts: { suffix?: string } = {}): string[] {
  const paths: string[] = [];
  for (const agentId of listActiveTenantAgents("operational")) {
    if (!shouldAutoPulse(agentId)) continue;
    paths.push(runAgentPulse(agentId, opts));
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
  for (const agentId of listActiveTenantAgents("operational")) {
    if (CORE_DEDICATED_SUMMARY.has(agentId)) continue;
    if (!shouldAutoPulse(agentId)) continue;
    paths.push(runAgentPulse(agentId, opts));
  }
  return paths;
}
