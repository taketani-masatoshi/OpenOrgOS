import { readFileSync } from "node:fs";
import YAML from "yaml";
import {
  applyOperatorChange,
  formatChangeApplyResult,
} from "../lib/operator-change/apply.js";
import {
  formatChangeProposal,
  planOperatorChange,
  saveChangeProposal,
} from "../lib/operator-change/plan.js";

export function runChangePlan(opts: {
  intentFile?: string;
  intentJson?: string;
  save?: boolean;
  json?: boolean;
}): void {
  const raw = opts.intentFile
    ? YAML.parse(readFileSync(opts.intentFile, "utf-8"))
    : opts.intentJson
      ? JSON.parse(opts.intentJson)
      : null;
  if (raw == null) {
    throw new Error("change plan requires --intent-file or --intent-json");
  }
  const proposal = planOperatorChange(raw);
  let saved: string | undefined;
  if (opts.save !== false) {
    saved = saveChangeProposal(proposal);
  }
  if (opts.json) {
    console.log(JSON.stringify({ proposal, saved }, null, 2));
    return;
  }
  console.log(formatChangeProposal(proposal));
  if (saved) console.log(`✓ saved ${saved}`);
}

export function runChangeApply(opts: {
  proposal: string;
  write?: boolean;
  dryRun?: boolean;
  iUnderstandGradeB?: boolean;
  operator?: string;
  json?: boolean;
}): void {
  const result = applyOperatorChange(opts.proposal, {
    write: Boolean(opts.write),
    dry_run: Boolean(opts.dryRun) || !opts.write,
    i_understand_grade_b: Boolean(opts.iUnderstandGradeB),
    operator_id: opts.operator,
  });
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatChangeApplyResult(result));
  }
  if (!result.ok) process.exitCode = 1;
}
