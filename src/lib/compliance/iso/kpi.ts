import { existsSync, readFileSync } from "node:fs";
import { parseCsv } from "../../csv.js";
import { resolveTenantPath } from "../../tenant.js";

export const KPI_LOG_REL = "docs/compliance/iso/ISO-21401/kpi-log.csv";
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
  intensity: Record<KpiMetric, number | null>;
  change: Record<KpiMetric, number | null>;
}

export interface KpiReport {
  path: string;
  exists: boolean;
  errors: string[];
  skipped: number;
  rows: KpiIntensityRow[];
  totals: { occupancy_nights: number } & Record<KpiMetric, number>;
  average_intensity: Record<KpiMetric, number | null>;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function parseNumber(raw: string): number | undefined {
  const value = (raw ?? "").trim();
  if (!value) return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function emptyMetrics<T>(value: T): Record<KpiMetric, T> {
  return Object.fromEntries(KPI_METRICS.map((metric) => [metric, value])) as Record<KpiMetric, T>;
}

function parseKpiRows(header: string[], rows: string[][]): { rows: KpiRow[]; skipped: number } {
  const column = (name: string): number => header.indexOf(name);
  const seen = new Set<string>();
  const parsed: KpiRow[] = [];
  let skipped = 0;
  for (const raw of rows) {
    const month = (raw[column("month")] ?? "").trim();
    if (!month) continue;
    if (!MONTH.test(month) || seen.has(month)) {
      skipped += 1;
      continue;
    }
    const occupancy = parseNumber(raw[column("occupancy_nights")] ?? "");
    const metrics = emptyMetrics(0);
    let usable = occupancy !== undefined;
    for (const metric of KPI_METRICS) {
      const value = parseNumber(raw[column(metric)] ?? "");
      if (value === undefined) usable = false;
      else metrics[metric] = value;
    }
    if (!usable) {
      skipped += 1;
      continue;
    }
    seen.add(month);
    const notes = (raw[column("notes")] ?? "").trim();
    parsed.push({
      month,
      occupancy_nights: occupancy as number,
      ...metrics,
      notes: notes || undefined,
    });
  }
  return {
    rows: parsed.sort((left, right) => left.month.localeCompare(right.month)),
    skipped,
  };
}

function ratio(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function calculateKpiRows(parsed: KpiRow[]): {
  rows: KpiIntensityRow[];
  errors: string[];
  totals: KpiReport["totals"];
} {
  const rows: KpiIntensityRow[] = [];
  const errors: string[] = [];
  const totals = { occupancy_nights: 0, ...emptyMetrics(0) };
  for (const row of parsed) {
    if (row.occupancy_nights === 0 && KPI_METRICS.some((metric) => row[metric] > 0)) {
      errors.push(
        `${row.month}: 宿泊人泊が 0 なのに使用量が記録されています。原単位を計算できません。`
      );
    }
    const intensity = emptyMetrics<number | null>(null);
    const change = emptyMetrics<number | null>(null);
    const previous = rows.at(-1);
    for (const metric of KPI_METRICS) {
      intensity[metric] = row.occupancy_nights > 0 ? row[metric] / row.occupancy_nights : null;
      change[metric] = previous ? ratio(intensity[metric], previous.intensity[metric]) : null;
      totals[metric] += row[metric];
    }
    totals.occupancy_nights += row.occupancy_nights;
    rows.push({ ...row, intensity, change });
  }
  return { rows, errors, totals };
}

export function buildKpiReport(relPath: string = KPI_LOG_REL): KpiReport {
  const path = resolveTenantPath(relPath);
  const emptyTotals = { occupancy_nights: 0, ...emptyMetrics(0) };
  if (!existsSync(path)) {
    return {
      path: relPath,
      exists: false,
      errors: [
        `${relPath} がありません。orgos iso templates ISO-21401 --write で配置してください。`,
      ],
      skipped: 0,
      rows: [],
      totals: emptyTotals,
      average_intensity: emptyMetrics(null),
    };
  }
  const csv = parseCsv(readFileSync(path, "utf-8"));
  const parsed = parseKpiRows(csv.header, csv.rows);
  const calculated = calculateKpiRows(parsed.rows);
  const average_intensity = emptyMetrics<number | null>(null);
  for (const metric of KPI_METRICS) {
    average_intensity[metric] =
      calculated.totals.occupancy_nights > 0
        ? calculated.totals[metric] / calculated.totals.occupancy_nights
        : null;
  }
  return {
    path: relPath,
    exists: true,
    errors: calculated.errors,
    skipped: parsed.skipped,
    rows: calculated.rows,
    totals: calculated.totals,
    average_intensity,
  };
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
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

export function formatKpiReport(report: KpiReport): string {
  const lines = ["# サステナビリティ KPI（ISO 21401）", "", `**記録:** ${report.path}`, ""];
  if (report.errors.length) {
    lines.push("## 検査結果", "");
    for (const error of report.errors) lines.push(`- ✗ ${error}`);
    lines.push("");
  }
  if (report.skipped > 0) {
    lines.push(
      `${report.skipped} 行を集計から除外しました。構造の不備は orgos iso records check --iso ISO-21401 で確認してください。`,
      ""
    );
  }
  if (!report.rows.length) {
    lines.push("集計できる測定記録がありません。");
    return lines.join("\n");
  }
  lines.push(
    "## 原単位（1人泊あたり）",
    "",
    `| 月 | 人泊 | ${KPI_METRICS.map((metric) => METRIC_LABELS[metric]).join(" | ")} |`,
    `|----|------|${KPI_METRICS.map(() => "------").join("|")}|`
  );
  for (const row of report.rows) {
    const cells = KPI_METRICS.map(
      (metric) =>
        `${fmt(row.intensity[metric])}${
          row.change[metric] === null ? "" : ` (${pct(row.change[metric])})`
        }`
    );
    lines.push(`| ${row.month} | ${row.occupancy_nights} | ${cells.join(" | ")} |`);
  }
  lines.push(
    "",
    "## 期間平均",
    "",
    `**総人泊:** ${report.totals.occupancy_nights}`,
    "",
    "| 指標 | 総量 | 原単位 |",
    "|------|------|--------|"
  );
  for (const metric of KPI_METRICS) {
    lines.push(
      `| ${METRIC_LABELS[metric]} | ${report.totals[metric]} | ${fmt(report.average_intensity[metric])} |`
    );
  }
  lines.push(
    "",
    "括弧内は前月比。削減目標は environmental-aspects.csv の objective 列と対応させる。"
  );
  return lines.join("\n");
}
