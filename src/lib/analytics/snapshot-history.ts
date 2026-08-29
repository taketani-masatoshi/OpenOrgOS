import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  snapshotHistoryFileSchema,
  type SnapshotHistoryFile,
} from "../../../schemas/analytics/index.js";
import type { KpiScorecardView } from "./kpi-scorecard-view.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";

export const SNAPSHOT_HISTORY_REL = "data/analytics/snapshot-history.yaml";

function historyPath(): string {
  return join(getDataDir(), "analytics", "snapshot-history.yaml");
}

export function loadSnapshotHistory(): SnapshotHistoryFile {
  const path = historyPath();
  if (!existsSync(path)) {
    return { version: 1, entries: [] };
  }
  return readYamlFile(path, snapshotHistoryFileSchema);
}

/** Previous calendar month label (YYYY-MM) from an ISO date. */
export function previousMonthLabel(fromDate: string): string {
  const [y, m] = fromDate.slice(0, 7).split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export interface MomDelta {
  delta: number | null;
  pct: number | null;
}

/** Month-over-month change. `pct` stays null when the baseline is zero or missing. */
export function computeMomDelta(actual: number | null, prev: number | null): MomDelta {
  if (actual == null || prev == null) return { delta: null, pct: null };
  const delta = actual - prev;
  return {
    delta,
    pct: prev !== 0 ? Math.round((delta / prev) * 1000) / 10 : null,
  };
}

export function getPreviousMonthValues(asOf: string): Map<string, number> {
  return getRecordedValues(previousMonthLabel(asOf));
}

/** Values recorded for one month (empty when that month was never snapshotted). */
export function getRecordedValues(month: string): Map<string, number> {
  const entry = loadSnapshotHistory().entries.find((e) => e.month === month);
  return new Map(Object.entries(entry?.values ?? {}));
}

/** Recorded history is the baseline for month-over-month; overwriting needs `force`. */
export function recordSnapshotHistory(
  view: KpiScorecardView,
  month?: string,
  opts?: { force?: boolean }
): void {
  const label = month?.trim() || view.as_of.slice(0, 7);
  const values: Record<string, number> = {};
  for (const row of view.rows) {
    if (row.actual.value != null) {
      values[row.metric.id] = row.actual.value;
    }
  }

  const file = loadSnapshotHistory();
  if (file.entries.some((e) => e.month === label) && !opts?.force) {
    throw new Error(
      `analytics snapshot: history for ${label} already exists (${SNAPSHOT_HISTORY_REL}). Use --force to overwrite.`
    );
  }
  const without = file.entries.filter((e) => e.month !== label);
  const next: SnapshotHistoryFile = {
    version: 1,
    entries: [...without, { month: label, values }].sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
  };
  writeYamlFile(historyPath(), next);
}
