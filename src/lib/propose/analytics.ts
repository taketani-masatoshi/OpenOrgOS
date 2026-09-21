import { loadFieldOpsJobs } from "./field-ops-ledger.js";
import { makeProposeReport, flattenProposeReport } from "./report.js";

export type FieldTimeRow = { staffId: string; minutes: number; travelMinutes: number };

export function analyzeFieldTime(rows: FieldTimeRow[]): {
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

/** Aggregate optional work/travel minutes from field_ops jobs by assignee. */
export function timeRowsFromFieldOpsJobs(): {
  rows: FieldTimeRow[];
  inputs_ref: string[];
} {
  const loaded = loadFieldOpsJobs();
  const byStaff = new Map<string, FieldTimeRow>();
  for (const job of loaded.jobs) {
    if (!job.assignee_id) continue;
    const minutes = job.work_minutes ?? 0;
    const travelMinutes = job.travel_minutes ?? 0;
    if (minutes === 0 && travelMinutes === 0) continue;
    const current = byStaff.get(job.assignee_id) ?? {
      staffId: job.assignee_id,
      minutes: 0,
      travelMinutes: 0,
    };
    current.minutes += minutes;
    current.travelMinutes += travelMinutes;
    byStaff.set(job.assignee_id, current);
  }
  const rows = [...byStaff.values()];
  return {
    rows,
    inputs_ref: rows.length > 0 ? loaded.inputs_ref : [],
  };
}

/**
 * One report. Reads field_ops/jobs.yaml when rows are omitted.
 * Does not issue overtime orders.
 */
export function renderFieldAnalyticsReport(rows?: FieldTimeRow[]): Record<string, unknown> {
  const inputs_ref: string[] = [];
  let source = rows;
  if (!source) {
    const loaded = timeRowsFromFieldOpsJobs();
    source = loaded.rows;
    inputs_ref.push(...loaded.inputs_ref);
  }
  const analysis = analyzeFieldTime(source);
  return flattenProposeReport(
    makeProposeReport({
      kind: "field-analytics-report",
      depth: inputs_ref.length > 0 ? "L2" : "L1",
      inputs_ref,
      human_gate: { apply: "human" },
      payload: {
        totalMinutes: analysis.totalMinutes,
        travelMinutes: analysis.travelMinutes,
        suggestion: analysis.suggestion,
        ordered: false,
        rowCount: source.length,
      },
    }),
  );
}
