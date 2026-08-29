import { computeDashboard, formatDashboardMarkdown } from "../lib/dashboard.js";
import { buildAnalyticsExecutiveAlertLine } from "../lib/analytics/index.js";
import {
  writeAgentSummaries,
  formatAgentSummariesSection,
} from "../lib/agent-summaries.js";
import { runExtensionAgentPulses } from "../lib/agent-pulse.js";
import { currentDate, writeMarkdownReport } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export interface DashboardOptions {
  markdown?: boolean;
  output?: string;
}

export function defaultDashboardFilename(): string {
  return `${currentDate()}.md`;
}

export function runDashboard(options: DashboardOptions = {}): void {
  requireCliReportWrite("dashboard");
  const report = computeDashboard();
  const summaryPaths = writeAgentSummaries(report);
  const extensionPulses = runExtensionAgentPulses({ suffix: "dashboard-sync" });
  const agentSection = formatAgentSummariesSection(summaryPaths);
  const analyticsLine = buildAnalyticsExecutiveAlertLine();
  const content = formatDashboardMarkdown(
    report,
    agentSection,
    analyticsLine ?? undefined
  );
  const filename = options.output ?? defaultDashboardFilename();

  if (options.markdown !== false) {
    const path = writeMarkdownReport("dashboard", filename, content);
    console.log(`✓ 経営ダッシュボード: ${path}`);
    console.log(`✓ Agent 要約 7 件 + 拡張 ${extensionPulses.length} 件: docs/reports/agent-summaries/ · executive-notes/`);
  }

  console.log(content);
}
