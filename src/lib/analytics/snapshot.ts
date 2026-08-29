import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDocsDir, writeTrackedFile } from "../utils.js";
import {
  buildKpiScorecardView,
  formatKpiScorecardMarkdown,
} from "./kpi-scorecard-view.js";
import { recordSnapshotHistory } from "./snapshot-history.js";

export const ANALYTICS_SNAPSHOTS_DOCS_REL = "docs/analytics/snapshots";

export interface AnalyticsSnapshotOptions {
  /** Month label (YYYY-MM) for the file name and history entry. */
  month?: string;
  /** As-of date (YYYY-MM-DD) used to resolve metric values. Defaults to today. */
  asOf?: string;
  output?: string;
  /** Allow backfilling a month that differs from `asOf`, and overwriting history. */
  force?: boolean;
}

export interface AnalyticsSnapshotResult {
  path: string;
  month: string;
  as_of: string;
}

/**
 * Metric values always come from `asOf`. Writing them under a different month is
 * backfill and requires `force`, otherwise stale numbers would enter the history.
 */
export function writeAnalyticsMonthlySnapshot(
  opts?: AnalyticsSnapshotOptions
): AnalyticsSnapshotResult {
  const view = buildKpiScorecardView({ asOf: opts?.asOf });
  const asOfMonth = view.as_of.slice(0, 7);
  const month = opts?.month?.trim() || asOfMonth;

  if (month !== asOfMonth && !opts?.force) {
    throw new Error(
      `analytics snapshot: --month ${month} does not match resolved values from ${view.as_of}. ` +
        `Pass --as-of ${month}-01 to compute that month, or --force to record current values under ${month}.`
    );
  }

  const dir = join(getDocsDir(), "analytics", "snapshots");
  mkdirSync(dir, { recursive: true });
  const path = writeTrackedFile(
    join(dir, opts?.output ?? `${month}.md`),
    formatKpiScorecardMarkdown(view)
  );
  recordSnapshotHistory(view, month, { force: opts?.force });
  return { path, month, as_of: view.as_of };
}
