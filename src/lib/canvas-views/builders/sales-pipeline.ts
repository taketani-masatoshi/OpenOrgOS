/**
 * Sales pipeline board — read-only Canvas View Model.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import { buildSalesPipelineView } from "../../sales-pipeline-view.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";
import { OPEN_SALES_STAGES } from "../../../../schemas/sales.js";

export function buildSalesPipelineCanvasViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
  includeDemo?: boolean;
  staleDays?: number;
  actionHorizonDays?: number;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const updatedAt = opts?.updatedAt?.trim() || `更新: ${reportDate}`;
  const view = buildSalesPipelineView({
    includeDemo: opts?.includeDemo ?? false,
    staleDays: opts?.staleDays,
    actionHorizonDays: opts?.actionHorizonDays,
  });
  const company = opts?.companyName?.trim() || view.company_name;

  return {
    version: 1,
    tenant,
    suite: "sales",
    view_id: "pipeline",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "営業パイプライン",
    summary: `オープン ${view.open_deals} 件 · 加重 ${view.weighted_pipeline_man} 万円 · アラート ${view.alerts.length} 件`,
    eyebrow: company,
    sections: [
      {
        type: "stats",
        items: [
          {
            value: String(view.open_deals),
            label: "オープン商談",
            tone: "info",
          },
          {
            value: `${view.weighted_pipeline_man}万`,
            label: "加重パイプライン",
            tone: "neutral",
          },
          {
            value: String(view.alerts.length),
            label: "アラート",
            tone: view.alerts.length > 0 ? "warning" : "neutral",
          },
        ],
      },
      {
        type: "table",
        title: "ステージ別件数",
        headers: ["ステージ", "件数"],
        rows: [
          ...OPEN_SALES_STAGES.map((s) => [s, String(view.by_stage[s])]),
          ["won", String(view.by_stage.won)],
          ["lost", String(view.by_stage.lost)],
        ],
      },
      {
        type: "table",
        title: "アラート（上位 12 件）",
        headers: ["商談ID", "取引先", "種別", "ステージ", "残日数"],
        rows: view.alerts.slice(0, 12).map((a) => [
          a.deal_id,
          a.counterparty,
          a.alert_type,
          a.stage,
          String(a.days_remaining),
        ]),
      },
    ],
    links: {
      web_path: `/t/${tenant}/sales/pipeline`,
      present_cmd: "orgos sales summary",
    },
  };
}
