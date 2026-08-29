import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";
import { resolveTenantPath } from "./tenant.js";

/**
 * Sustainability KPI log for ISO 21401 — resource use measured against guest
 * nights. Intensity, not absolute volume, is what an accommodation can steer:
 * a busy month legitimately consumes more, so only per-guest-night figures are
 * comparable across periods.
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
  errors: string[];
  rows: KpiIntensityRow[];
  totals: { occupancy_nights: number } & Record<KpiMetric, number>;
  average_intensity: Record<KpiMetric, number | null>;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseNumber(raw: string, column: string, month: string, errors: string[]): number {
  const value = raw.trim();
  if (value === "") return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    errors.push(`${month}: ${column} が数値ではありません（"${value}"）`);
    return 0;
  }
  if (n < 0) {
    errors.push(`${month}: ${column} が負の値です（${n}）`);
    return 0;
  }
  return n;
}

function emptyMetrics<T>(value: T): Record<KpiMetric, T> {
  return Object.fromEntries(KPI_METRICS.map((m) => [m, value])) as Record<KpiMetric, T>;
}

function ratio(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * Read and check the KPI log. Structural problems are collected rather than
 * thrown so an operator sees every fault in one pass.
 */
export function buildKpiReport(relPath: string = KPI_LOG_REL): KpiReport {
  const path = resolveTenantPath(relPath);
  const errors: string[] = [];
  const totals = { occupancy_nights: 0, ...emptyMetrics(0) };
  if (!existsSync(path)) {
    return {
      path: relPath,
      exists: false,
      errors: [`${relPath} がありません。orgos iso templates ISO-21401 --write で配置してください。`],
      rows: [],
      totals,
      average_intensity: emptyMetrics(null),
    };
  }

  const { header, rows } = parseCsv(readFileSync(path, "utf-8"));
  for (const column of KPI_COLUMNS) {
    if (!header.includes(column)) errors.push(`列 ${column} がありません。`);
  }
  const index = (c: string): number => header.indexOf(c);

  const seen = new Set<string>();
  const parsed: KpiRow[] = [];
  for (const raw of rows) {
    const month = (raw[index("month")] ?? "").trim();
    if (month === "") continue;
    if (!MONTH.test(month)) {
      errors.push(`month は YYYY-MM 形式で記入してください（"${month}"）`);
      continue;
    }
    if (seen.has(month)) {
      errors.push(`${month}: 同じ月が重複しています。`);
      continue;
    }
    seen.add(month);
    const nights = parseNumber(raw[index("occupancy_nights")] ?? "", "occupancy_nights", month, errors);
    const metrics = emptyMetrics(0);
    for (const metric of KPI_METRICS) {
      metrics[metric] = parseNumber(raw[index(metric)] ?? "", metric, month, errors);
    }
    if (nights === 0 && KPI_METRICS.some((m) => metrics[m] > 0)) {
      errors.push(`${month}: 宿泊人泊が 0 なのに使用量が記録されています。原単位を計算できません。`);
    }
    const notes = (raw[index("notes")] ?? "").trim();
    parsed.push({ month, occupancy_nights: nights, ...metrics, notes: notes || undefined });
  }

  parsed.sort((a, b) => a.month.localeCompare(b.month));

  const out: KpiIntensityRow[] = [];
  for (const [i, row] of parsed.entries()) {
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

  if (out.length === 0 && errors.length === 0) {
    errors.push(`${relPath} に測定記録がありません。月次で記入してください。`);
  }

  return { path: relPath, exists: true, errors, rows: out, totals, average_intensity };
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
  if (report.rows.length === 0) return lines.join("\n");

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
