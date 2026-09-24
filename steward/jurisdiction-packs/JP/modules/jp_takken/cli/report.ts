import {
  countByStatus,
  STATUS_MARK,
  type TakkenCheckItem,
  type TakkenCheckStatus,
  worstStatus,
} from "./check-item.js";

export const HUMAN_DECISION_NOTICE =
  "※ 記録に基づく準備・点検支援であり適法性を保証しない — 最終判断・届出・申請は人間が行う";

export interface TakkenReport {
  module: string;
  report: string;
  as_of: string;
  jurisdiction: string;
  status: TakkenCheckStatus;
  counts: Record<TakkenCheckStatus, number>;
  checks: TakkenCheckItem[];
}

export function buildReport(input: {
  module: string;
  report: string;
  asOf: string;
  jurisdiction: string;
  checks: TakkenCheckItem[];
}): TakkenReport {
  return {
    module: input.module,
    report: input.report,
    as_of: input.asOf,
    jurisdiction: input.jurisdiction,
    status: worstStatus(input.checks.map((check) => check.status)),
    counts: countByStatus(input.checks),
    checks: input.checks,
  };
}

export function formatCheckLine(check: TakkenCheckItem): string {
  return `${STATUS_MARK[check.status]} [${check.id}] ${check.label} — ${check.detail}（${check.article}）`;
}

export function formatCounts(counts: Record<TakkenCheckStatus, number>): string {
  return `ok ${counts.ok} · warn ${counts.warn} · needs_review ${counts.needs_review} · fail ${counts.fail}`;
}

export function printReport(title: string, report: TakkenReport): void {
  console.log(`# ${title}（as of ${report.as_of}）\n`);
  for (const check of report.checks) console.log(formatCheckLine(check));
  console.log(`\n結果: ${report.status} · ${formatCounts(report.counts)}`);
  console.log(HUMAN_DECISION_NOTICE);
}
