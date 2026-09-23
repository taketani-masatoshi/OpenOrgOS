import type { AgentReadinessResult } from "../../../../schemas/agent-capability.js";

export function formatAgentReadinessReport(results: AgentReadinessResult[]): string {
  const lines = [
    "# Agent Readiness — 完成度",
    "",
    "| Agent | % | 定義 | Skill | データ | route | 要約 | test | tenant |",
    "|-------|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of results.sort((a, b) => a.pct - b.pct)) {
    const ax = Object.fromEntries(r.axes.map((a) => [a.id, a.score]));
    lines.push(
      `| ${r.agent_id} | ${r.pct} | ${ax.definition ?? 0} | ${ax.skill_cli ?? 0} | ${ax.data_sot ?? 0} | ${ax.routing ?? 0} | ${ax.dashboard ?? 0} | ${ax.test ?? 0} | ${ax.tenant ?? 0} |`
    );
  }
  const below = results.filter((r) => r.pct < 80);
  lines.push("", `**80% 未満:** ${below.length} 件`, "");
  return lines.join("\n");
}
