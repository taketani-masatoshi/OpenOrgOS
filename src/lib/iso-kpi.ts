import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import { resolveTenantPath } from "./tenant.js";

/**
 * Sustainability KPI log for ISO 21401 — resource use measured against guest
 * nights. Intensity, not absolute volume, is what an accommodation can steer:
 * a busy month legitimately consumes more, so only per-guest-night figures are
 * comparable across periods.
 *
 * Structural validity of the log (columns, month format, duplicates, ranges) is
 * declared in the pack's `records.yaml` and checked by `orgos iso records check`.
 * This module computes; rows it cannot compute from are skipped rather than
 * reported twice.
 */
export const KPI_LOG_REL = "docs/compliance/iso/ISO-21401/kpi-log.csv";

/** Metered quantities, in the unit named by the column. */
export const KPI_METRICS = ["garbage_kg", "electricity_kwh", "gas_m3", "water_m3"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const KPI_COLUMNS = ["month", "occupancy_nights", ...KPI_METRICS, "notes"] as const;

export interface KpiRow {
  month: string;
  occupancy_nights: number;
  garbage_kg: number;
  electricity_kwh: number;
  gas_m3: number;
  water_m3: number;
  notes?: string;
}

export interface KpiIntensityRow extends KpiRow {
  /** Per guest night. `null` when the month had no occupancy. */
  intensity: Record<KpiMetric, number | null>;
  /** Change against the previous logged month, as a ratio. */
  change: Record<KpiMetric, number | null>;
}

export interface KpiReport {
  path: string;
  exists: boolean;
  /** Only faults that stop the computation. Structural faults belong to records check. */
  errors: string[];
  /** Rows dropped because they could not be parsed into a comparable month. */
  skipped: number;
  rows: KpiIntensityRow[];
  totals: { occupancy_nights: number } & Record<KpiMetric, number>;
  average_intensity: Record<KpiMetric, number | null>;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseNumber(raw: string): number | undefined {
  const value = (raw ?? "").trim();
  if (value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function emptyMetrics<T>(value: T): Record<KpiMetric, T> {
  return Object.fromEntries(KPI_METRICS.map((m) => [m, value])) as Record<KpiMetric, T>;
}

function ratio(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

/** Read the KPI log and derive per-guest-night intensity and month-on-month change. */
export function buildKpiReport(relPath: string = KPI_LOG_REL): KpiReport {
  const path = resolveTenantPath(relPath);
  const errors: string[] = [];
  const totals = { occupancy_nights: 0, ...emptyMetrics(0) };
  if (!existsSync(path)) {
    return {
      path: relPath,
      exists: false,
      errors: [`${relPath} がありません。orgos iso templates ISO-21401 --write で配置してください。`],
      skipped: 0,
      rows: [],
      totals,
      average_intensity: emptyMetrics(null),
    };
  }

  const { header, rows } = parseCsv(readFileSync(path, "utf-8"));
  const index = (c: string): number => header.indexOf(c);

  const seen = new Set<string>();
  const parsed: KpiRow[] = [];
  let skipped = 0;
  for (const raw of rows) {
    const month = (raw[index("month")] ?? "").trim();
    if (month === "") continue;
    if (!MONTH.test(month) || seen.has(month)) {
      skipped += 1;
      continue;
    }
    const nights = parseNumber(raw[index("occupancy_nights")] ?? "");
    const metrics = emptyMetrics(0);
    let usable = nights !== undefined;
    for (const metric of KPI_METRICS) {
      const value = parseNumber(raw[index(metric)] ?? "");
      if (value === undefined) usable = false;
      else metrics[metric] = value;
    }
    if (!usable) {
      skipped += 1;
      continue;
    }
    seen.add(month);
    const notes = (raw[index("notes")] ?? "").trim();
    parsed.push({ month, occupancy_nights: nights as number, ...metrics, notes: notes || undefined });
  }

  parsed.sort((a, b) => a.month.localeCompare(b.month));

  const out: KpiIntensityRow[] = [];
  for (const [i, row] of parsed.entries()) {
    if (row.occupancy_nights === 0 && KPI_METRICS.some((m) => row[m] > 0)) {
      errors.push(`${row.month}: 宿泊人泊が 0 なのに使用量が記録されています。原単位を計算できません。`);
    }
    const intensity = emptyMetrics<number | null>(null);
    for (const metric of KPI_METRICS) {
      intensity[metric] = row.occupancy_nights > 0 ? row[metric] / row.occupancy_nights : null;
    }
    const previous = i > 0 ? out[i - 1] : undefined;
    const change = emptyMetrics<number | null>(null);
    for (const metric of KPI_METRICS) {
      change[metric] = previous ? ratio(intensity[metric], previous.intensity[metric]) : null;
    }
    totals.occupancy_nights += row.occupancy_nights;
    for (const metric of KPI_METRICS) totals[metric] += row[metric];
    out.push({ ...row, intensity, change });
  }

  const average_intensity = emptyMetrics<number | null>(null);
  for (const metric of KPI_METRICS) {
    average_intensity[metric] =
      totals.occupancy_nights > 0 ? totals[metric] / totals.occupancy_nights : null;
  }

  return { path: relPath, exists: true, errors, skipped, rows: out, totals, average_intensity };
}

const METRIC_LABELS: Record<KpiMetric, string> = {
  garbage_kg: "廃棄物 kg",
  electricity_kwh: "電力 kWh",
  gas_m3: "ガス m3",
  water_m3: "水 m3",
};

function fmt(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

export function formatKpiReport(report: KpiReport): string {
  const lines = ["# サステナビリティ KPI（ISO 21401）", "", `**記録:** ${report.path}`, ""];
  if (report.errors.length > 0) {
    lines.push("## 検査結果", "");
    for (const e of report.errors) lines.push(`- ✗ ${e}`);
    lines.push("");
  }
  if (report.skipped > 0) {
    lines.push(
      `${report.skipped} 行を集計から除外しました。構造の不備は orgos iso records check --iso ISO-21401 で確認してください。`,
      "",
    );
  }
  if (report.rows.length === 0) {
    lines.push("集計できる測定記録がありません。");
    return lines.join("\n");
  }

  lines.push("## 原単位（1人泊あたり）", "");
  lines.push(`| 月 | 人泊 | ${KPI_METRICS.map((m) => METRIC_LABELS[m]).join(" | ")} |`);
  lines.push(`|----|------|${KPI_METRICS.map(() => "------").join("|")}|`);
  for (const row of report.rows) {
    const cells = KPI_METRICS.map(
      (m) => `${fmt(row.intensity[m])}${row.change[m] === null ? "" : ` (${pct(row.change[m])})`}`,
    );
    lines.push(`| ${row.month} | ${row.occupancy_nights} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## 期間平均", "");
  lines.push(`**総人泊:** ${report.totals.occupancy_nights}`, "");
  lines.push("| 指標 | 総量 | 原単位 |");
  lines.push("|------|------|--------|");
  for (const metric of KPI_METRICS) {
    lines.push(
      `| ${METRIC_LABELS[metric]} | ${report.totals[metric]} | ${fmt(report.average_intensity[metric])} |`,
    );
  }
  lines.push("", "括弧内は前月比。削減目標は environmental-aspects.csv の objective 列と対応させる。");
  return lines.join("\n");
}
