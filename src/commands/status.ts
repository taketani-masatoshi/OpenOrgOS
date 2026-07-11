import { computeMaturityReport, formatMaturityReport } from "../lib/maturity.js";
import { computeDataHealth, formatHealthReport } from "../lib/data-health.js";
import { runIntegrityChecks } from "../lib/integrity.js";
import { computeOs99Score, computeOrgOsScore, computeOpenOrgOsCoreScore, formatOs99Score, formatOrgOsScore, formatOpenOrgOsCoreScore } from "../lib/os-score.js";
import { writeMarkdownReport } from "../lib/utils.js";
import { requireCliReportWrite } from "../lib/console-auth/cli-operator.js";
import { computeReadinessStatus } from "../lib/readiness.js";

export interface StatusOptions {
  markdown?: boolean;
  output?: string;
  verbose?: boolean;
  legacy?: boolean;
  os99?: boolean;
  orgos?: boolean;
  readiness?: boolean;
  json?: boolean;
}

export function runStatus(opts: StatusOptions): void {
  if (opts.readiness) {
    const readiness = computeReadinessStatus();
    if (opts.json) {
      console.log(JSON.stringify(readiness, null, 2));
      return;
    }
    console.log(
      [
        `Core: ${readiness.core.strict.weighted}/100`,
        `OrgOS: ${readiness.orgos.strict.weighted}/100`,
        `Wire: ${readiness.wire.checklist.total}/100 (checklist; strict not executed)`,
        `Community: ${readiness.community.score}/100`,
        `Agents: operational ${readiness.agents.operational.length} · advisor ${readiness.agents.advisor.length} · bootstrap ${readiness.agents.bootstrap.length}`,
        `Evidence: ${readiness.evidence.detail}`,
      ].join("\n")
    );
    return;
  }

  const report = computeMaturityReport();
  let text = formatMaturityReport(report, opts.markdown);

  if (opts.os99) {
    const os = computeOs99Score(report);
    text += opts.markdown
      ? `\n\n${formatOs99Score(os, true)}`
      : `\n\n${formatOs99Score(os)}`;
  }

  if (opts.orgos) {
    const orgOs = computeOrgOsScore();
    const core = computeOpenOrgOsCoreScore();
    text += opts.markdown
      ? `\n\n${formatOrgOsScore(orgOs, true)}\n\n${formatOpenOrgOsCoreScore(core, true)}`
      : `\n\n${formatOrgOsScore(orgOs)}\n\n${formatOpenOrgOsCoreScore(core)}`;
  }

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
    requireCliReportWrite("status");
    const path = writeMarkdownReport("status", opts.output, text);
    console.log(`✓ Status report written to ${path}`);
  } else {
    console.log(text);
  }
}
