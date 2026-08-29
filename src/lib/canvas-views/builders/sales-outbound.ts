/**
 * Outbound campaign board — read-only Canvas View Model.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import { buildSalesOutboundView } from "../../sales-outbound-view.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

const OUTBOUND_STATUSES = ["draft", "active", "paused", "completed"] as const;

export function buildSalesOutboundCanvasViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
  includeDemo?: boolean;
  actionHorizonDays?: number;
  lowCoveragePct?: number;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const updatedAt = opts?.updatedAt?.trim() || `更新: ${reportDate}`;
  const view = buildSalesOutboundView({
    includeDemo: opts?.includeDemo ?? false,
    actionHorizonDays: opts?.actionHorizonDays,
    lowCoveragePct: opts?.lowCoveragePct,
  });
  const company = opts?.companyName?.trim() || view.company_name;
  const coverage =
    view.aggregate_coverage_pct != null
      ? `${view.aggregate_coverage_pct}%`
      : "—";

  return {
    version: 1,
    tenant,
    suite: "sales",
    view_id: "outbound",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "アウトバウンド施策",
    summary: `active ${view.active_campaigns} 件 · 接触率 ${coverage} · アラート ${view.alerts.length} 件`,
    eyebrow: company,
    sections: [
      {
        type: "stats",
        items: [
          {
            value: String(view.active_campaigns),
            label: "active",
            tone: view.active_campaigns > 0 ? "info" : "neutral",
          },
          {
            value: coverage,
            label: "接触率",
            tone:
              view.alerts.some((a) => a.alert_type === "low_coverage")
                ? "warning"
                : "neutral",
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
        title: "ステータス別件数",
        headers: ["ステータス", "件数"],
        rows: OUTBOUND_STATUSES.map((s) => [s, String(view.by_status[s])]),
      },
      {
        type: "table",
        title: "接触カバレッジ",
        headers: ["施策ID", "名称", "target", "contacted", "率%"],
        rows: view.coverage_rows.slice(0, 12).map((r) => [
          r.campaign_id,
          r.name,
          r.target_count != null ? String(r.target_count) : "—",
          r.contacted_count != null ? String(r.contacted_count) : "—",
          r.coverage_pct != null ? String(r.coverage_pct) : "—",
        ]),
      },
      {
        type: "table",
        title: "アラート（上位 12 件）",
        headers: ["施策ID", "名称", "種別", "ステータス", "残日数"],
        rows: view.alerts.slice(0, 12).map((a) => [
          a.campaign_id,
          a.name,
          a.alert_type,
          a.status,
          a.days_remaining != null ? String(a.days_remaining) : "—",
        ]),
      },
    ],
    links: {
      web_path: `/t/${tenant}/sales/outbound`,
      present_cmd: "orgos sales outbound",
    },
  };
}
