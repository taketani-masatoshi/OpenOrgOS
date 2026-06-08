import { computeMaturityReport, formatMaturityReport } from "../lib/maturity.js";
import { computeDataHealth, formatHealthReport } from "../lib/data-health.js";
import { runIntegrityChecks } from "../lib/integrity.js";
import { writeMarkdownReport } from "../lib/utils.js";

export interface StatusOptions {
  markdown?: boolean;
  output?: string;
  verbose?: boolean;
  legacy?: boolean;
}

export function runStatus(opts: StatusOptions): void {
  const report = computeMaturityReport();
  let text = formatMaturityReport(report, opts.markdown);

  if (opts.legacy) {
    const legacy = computeDataHealth();
    text += opts.markdown
      ? `\n\n## データ成熟度（legacy）\n\n${formatHealthReport(legacy, true).split("\n").slice(2).join("\n")}`
      : `\n\n--- legacy ---\n${formatHealthReport(legacy)}`;
  }

  if (opts.verbose) {
    const issues = runIntegrityChecks();
    const warnings = issues.filter((i) => i.level === "warning");
    if (warnings.length) {
      text += opts.markdown
        ? `\n\n## 警告 (${warnings.length})\n\n${warnings.map((w) => `- \`${w.file}\`: ${w.message}`).join("\n")}`
        : `\n\n警告 (${warnings.length}):\n${warnings.map((w) => `  ${w.file}: ${w.message}`).join("\n")}`;
    }
  }

  if (opts.output) {
    const path = writeMarkdownReport("status", opts.output, text);
    console.log(`✓ Status report written to ${path}`);
  } else {
    console.log(text);
  }
}
