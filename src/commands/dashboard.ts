import { computeDashboard, formatDashboardMarkdown } from "../lib/dashboard.js";
import {
  writeAgentSummaries,
  formatAgentSummariesSection,
} from "../lib/agent-summaries.js";
import { currentDate, writeMarkdownReport } from "../lib/utils.js";

export interface DashboardOptions {
  markdown?: boolean;
  output?: string;
}

export function defaultDashboardFilename(): string {
  return `${currentDate()}.md`;
}

export function runDashboard(options: DashboardOptions = {}): void {
  const report = computeDashboard();
  const summaryPaths = writeAgentSummaries(report);
  const agentSection = formatAgentSummariesSection(summaryPaths);
  const content = formatDashboardMarkdown(report, agentSection);
  const filename = options.output ?? defaultDashboardFilename();

  if (options.markdown !== false) {
    const path = writeMarkdownReport("dashboard", filename, content);
    console.log(`✓ 経営ダッシュボード: ${path}`);
    console.log(`✓ Agent 要約 7 件: docs/reports/agent-summaries/ · executive-notes/`);
  }

  console.log(content);
}
