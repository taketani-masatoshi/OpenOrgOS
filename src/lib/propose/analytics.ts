import { makeProposeReport, flattenProposeReport } from "./report.js";

export function analyzeFieldTime(
  rows: Array<{ staffId: string; minutes: number; travelMinutes: number }>,
): {
  totalMinutes: number;
  travelMinutes: number;
  suggestion: string;
  note: { observation: string; ordered: false };
} {
  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const travelMinutes = rows.reduce((sum, row) => sum + row.travelMinutes, 0);
  const suggestion =
    travelMinutes > totalMinutes / 2
      ? "移動が作業時間の半分を超えています。近接するジョブを同じ担当案にまとめてください。"
      : "移動比率は半分以下です。割当案の見直しは必須ではありません。";
  return {
    totalMinutes,
    travelMinutes,
    suggestion,
    note: { observation: suggestion, ordered: false },
  };
}

/** One report. Does not issue overtime orders. */
export function renderFieldAnalyticsReport(
  rows: Array<{ staffId: string; minutes: number; travelMinutes: number }>,
): Record<string, unknown> {
  const analysis = analyzeFieldTime(rows);
  return flattenProposeReport(
    makeProposeReport({
      kind: "field-analytics-report",
      depth: "L1",
      human_gate: { apply: "human" },
      payload: {
        totalMinutes: analysis.totalMinutes,
        travelMinutes: analysis.travelMinutes,
        suggestion: analysis.suggestion,
        ordered: false,
      },
    }),
  );
}
