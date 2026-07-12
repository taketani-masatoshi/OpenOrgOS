import { loadContracts } from "../lib/data.js";
import { scanContractAlerts, formatAlertsMarkdown, formatAlertsTable } from "../lib/alerts.js";
import { writeMarkdownReport, currentDate } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";

export function runAlerts(options: {
  days: number;
  riskLevel?: string;
  output?: string;
  markdown?: boolean;
}): void {
  const contracts = loadContracts();
  const alerts = scanContractAlerts(contracts, options.days, options.riskLevel);

  if (options.output) {
    requireCliReportWrite("alerts");
    const content = formatAlertsMarkdown(alerts, options.days);
    const path = writeMarkdownReport("alerts", options.output, content);
    console.log(`✓ Report saved to ${path}`);
  } else if (options.markdown) {
    console.log(formatAlertsMarkdown(alerts, options.days));
  } else {
    formatAlertsTable(alerts);
  }

  if (alerts.length > 0) {
    process.exit(1);
  }
}

export function runAlertsReport(days: number): string {
  const contracts = loadContracts();
  const alerts = scanContractAlerts(contracts, days);
  return formatAlertsMarkdown(alerts, days);
}

export function defaultAlertsFilename(): string {
  return `${currentDate()}.md`;
}
