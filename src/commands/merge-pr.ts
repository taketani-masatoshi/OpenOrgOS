import { createPullRequest, formatPrPlan, planPullRequest } from "../lib/git-pr.js";

export interface MergePrPlanOptions {
  id: string;
  base?: string;
  json?: boolean;
}

export function runMergePrPlan(opts: MergePrPlanOptions): void {
  const manifest = planPullRequest(opts.id, opts.base ?? "main");
  if (opts.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  console.log(formatPrPlan(manifest));
}

export interface MergePrCreateOptions {
  id: string;
  base?: string;
  dryRun?: boolean;
  allowEmpty?: boolean;
  json?: boolean;
}

export function runMergePrCreate(opts: MergePrCreateOptions): void {
  if (opts.dryRun) {
    const manifest = planPullRequest(opts.id, opts.base ?? "main");
    console.log(formatPrPlan(manifest));
    console.log("\n(dry-run — no git/gh commands executed)");
    return;
  }

  try {
    const created = createPullRequest({
      id: opts.id,
      base: opts.base,
      dryRun: false,
      allowEmpty: opts.allowEmpty,
    });
    if (opts.json) {
      console.log(JSON.stringify(created, null, 2));
      return;
    }
    console.log(`✓ branch ${created.branch}`);
    if (created.pr_url) console.log(`✓ PR ${created.pr_url}`);
    else console.log("⚠ gh not available — branch committed locally");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
