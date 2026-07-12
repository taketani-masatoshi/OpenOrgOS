import { loadYojitsuFyPlan, loadMonthlyFinances, loadBusinessPlan } from "./data.js";
import { aggregateBySegment, resolveYojitsuMonthSide, sumRevenue } from "./yojitsu-normalize.js";

export interface MonthVariance {
  month: string;
  planRevenue: number;
  actualRevenue: number;
  delta: number;
  pct: number | null;
}

export interface SegmentVariance {
  segment: string;
  planTotal: number;
  actualTotal: number;
  delta: number;
}

export interface VarianceReport {
  fiscalYear: string;
  months: MonthVariance[];
  segments: SegmentVariance[];
  planTotal: number;
  actualTotal: number;
  deltaTotal: number;
}

function sumRevenueFromFinanceMonth(revenue: { amount: number }[]): number {
  return revenue.reduce((s, r) => s + r.amount, 0);
}

/** 予実 FY 計画 vs 月次 finance YAML の売上差異 */
export function computeVarianceReport(fiscalYear = "FY2026"): VarianceReport {
  const yojitsu = loadYojitsuFyPlan(fiscalYear);
  const finances = loadMonthlyFinances();
  const financeByMonth = new Map(finances.map((f) => [f.month, f]));

  const months: MonthVariance[] = [];
  let planTotal = 0;
  let actualTotal = 0;

  for (const ym of yojitsu?.months ?? []) {
    const plan = sumRevenue(ym.plan);
    const yActual = sumRevenue(resolveYojitsuMonthSide(ym));
    const fin = financeByMonth.get(ym.month);
    const finRev = fin ? sumRevenueFromFinanceMonth(fin.revenue) : yActual;
    const delta = finRev - plan;
    months.push({
      month: ym.month,
      planRevenue: plan,
      actualRevenue: finRev,
      delta,
      pct: plan ? Math.round((delta / plan) * 1000) / 10 : null,
    });
    planTotal += plan;
    actualTotal += finRev;
  }

  const planBySegment = yojitsu
    ? aggregateBySegment(yojitsu, "revenue", false)
    : new Map<string, number>();
  const actualBySegment = yojitsu
    ? aggregateBySegment(yojitsu, "revenue", true)
    : new Map<string, number>();
  const segmentNames = new Set([...planBySegment.keys(), ...actualBySegment.keys()]);
  const segments: SegmentVariance[] = [...segmentNames]
    .sort()
    .map((segment) => {
      const planSeg = planBySegment.get(segment) ?? 0;
      const actualSeg = actualBySegment.get(segment) ?? 0;
      return {
        segment,
        planTotal: planSeg,
        actualTotal: actualSeg,
        delta: actualSeg - planSeg,
      };
    })
    .filter((s) => s.planTotal > 0 || s.actualTotal > 0);

  return {
    fiscalYear,
    months,
    segments,
    planTotal,
    actualTotal,
    deltaTotal: actualTotal - planTotal,
  };
}

export function formatVarianceMarkdown(report: VarianceReport): string {
  const lines = [
    `# 予実差異 — ${report.fiscalYear}`,
    "",
    "## セグメント別（売上）",
    "",
    "| セグメント | 計画 | 実績/月次 | 差異 |",
    "|-----------|-----:|----------:|-----:|",
    ...(report.segments.length
      ? report.segments.map(
          (s) =>
            `| ${s.segment} | ${s.planTotal.toLocaleString()} | ${s.actualTotal.toLocaleString()} | ${s.delta >= 0 ? "+" : ""}${s.delta.toLocaleString()} |`
        )
      : ["| （セグメントなし） | — | — | — |"]),
    "",
    "## 月次",
    "",
    "| 月 | 計画売上 | 月次YAML売上 | 差異 | 差異% |",
    "|----|--------:|------------:|-----:|------:|",
    ...report.months.map(
      (m) =>
        `| ${m.month} | ${m.planRevenue.toLocaleString()} | ${m.actualRevenue.toLocaleString()} | ${m.delta >= 0 ? "+" : ""}${m.delta.toLocaleString()} | ${m.pct ?? "—"}% |`
    ),
    "",
    `**合計:** 計画 ${report.planTotal.toLocaleString()} · 実績 ${report.actualTotal.toLocaleString()} · 差異 ${report.deltaTotal >= 0 ? "+" : ""}${report.deltaTotal.toLocaleString()}`,
    "",
    "*生成: `steward finances variance`*",
  ];
  return lines.join("\n");
}

/** CLI 用 — business-plan segments と yojitsu の整合を簡易表示 */
export function listYojitsuSegmentNames(fiscalYear = "FY2026"): string[] {
  const bp = loadBusinessPlan();
  const fromPlan = bp.segments.map((s) => s.name);
  const report = computeVarianceReport(fiscalYear);
  const fromYojitsu = report.segments.map((s) => s.segment);
  return [...new Set([...fromPlan, ...fromYojitsu])].filter(Boolean);
}
