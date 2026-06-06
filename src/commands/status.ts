import { computeDataHealth, formatHealthReport } from "../lib/data-health.js";
import { runIntegrityChecks } from "../lib/integrity.js";
import { writeMarkdownReport } from "../lib/utils.js";

export interface StatusOptions {
  markdown?: boolean;
  output?: string;
  verbose?: boolean;
}

export function runStatus(opts: StatusOptions): void {
  const report = computeDataHealth();
  let text = formatHealthReport(report, opts.markdown);

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
