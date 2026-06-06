import { computeDashboard, formatDashboardMarkdown } from "../lib/dashboard.js";
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
  const content = formatDashboardMarkdown(report);
  const filename = options.output ?? defaultDashboardFilename();

  if (options.markdown !== false) {
    const path = writeMarkdownReport("dashboard", filename, content);
    console.log(`✓ 経営ダッシュボード: ${path}`);
  }

  console.log(content);
}
