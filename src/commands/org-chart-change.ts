import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  validateOrgChartChangeProposal,
  describeOrgChartChangeProposal,
  applyOrgChartChangeProposal,
  orgChartChangesDir,
  proposeOrgChartChange,
} from "../lib/org/org-chart-change.js";

export { orgChartChangesDir };

export function runOrgChartChangePropose(opts: {
  file: string;
  approval: string;
  operator: string;
  json?: boolean;
}): void {
  const input = YAML.parse(readFileSync(opts.file, "utf-8"));
  const proposal = proposeOrgChartChange({
    input,
    approvalId: opts.approval,
    proposedBy: opts.operator,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, proposal }, null, 2));
    return;
  }
  console.log(`✓ proposed ${describeOrgChartChangeProposal(proposal)}`);
  console.log(`  data/org/org-chart-changes/${proposal.change_id}.yaml`);
}

export function collectOrgChartChangeValidationIssues(): Array<{
  file: string;
  message: string;
}> {
  const dir = orgChartChangesDir();
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));
  } catch {
    return [];
  }
  const issues: Array<{ file: string; message: string }> = [];
  for (const name of entries) {
    const file = join(dir, name);
    try {
      const raw = readFileSync(file, "utf-8");
      validateOrgChartChangeProposal(YAML.parse(raw));
    } catch (error) {
      issues.push({
        file: `data/org/org-chart-changes/${name}`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return issues;
}

export function runOrgChartChangeValidate(opts: { file?: string; json?: boolean }): void {
  if (opts.file) {
    const raw = readFileSync(opts.file, "utf-8");
    const proposal = validateOrgChartChangeProposal(YAML.parse(raw));
    const summary = describeOrgChartChangeProposal(proposal);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, proposal, summary }, null, 2));
      return;
    }
    console.log(`✓ ${summary}`);
    return;
  }

  const issues = collectOrgChartChangeValidationIssues();
  if (opts.json) {
    console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
    if (issues.length) process.exitCode = 1;
    return;
  }

  if (issues.length === 0) {
    console.log("✓ No org-chart change proposals (or all valid).");
    return;
  }

  console.error("✗ Org-chart change validation failed:");
  for (const issue of issues) {
    console.error(`  ${issue.file}: ${issue.message}`);
  }
  process.exit(1);
}

export function runOrgChartChangeApply(opts: {
  file: string;
  operator: string;
  dryRun?: boolean;
  json?: boolean;
}): void {
  const raw = readFileSync(opts.file, "utf-8");
  const proposal = validateOrgChartChangeProposal(YAML.parse(raw));
  const result = applyOrgChartChangeProposal({
    proposal,
    appliedBy: opts.operator,
    dryRun: opts.dryRun,
  });
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, proposal, result }, null, 2));
    return;
  }
  if (result.dry_run) {
    console.log(`✓ dry-run ${describeOrgChartChangeProposal(proposal)}`);
    console.log(`  before ${result.before_hash.slice(0, 20)}… → after ${result.after_hash.slice(0, 20)}…`);
    return;
  }
  console.log(`✓ applied ${describeOrgChartChangeProposal(proposal)}`);
  console.log(`  ${result.logical_path}`);
}
