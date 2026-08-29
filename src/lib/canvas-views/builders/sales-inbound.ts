/**
 * Inbound inquiry board — read-only Canvas View Model.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import {
  buildSalesInboundView,
  countAwaitingResponse,
} from "../../sales-inbound-view.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

const INBOUND_STATUSES = [
  "new",
  "triaged",
  "responded",
  "qualified",
  "closed",
] as const;

export function buildSalesInboundCanvasViewModel(opts?: {
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
  const view = buildSalesInboundView({
    includeDemo: opts?.includeDemo ?? false,
    staleDays: opts?.staleDays,
    actionHorizonDays: opts?.actionHorizonDays,
  });
  const company = opts?.companyName?.trim() || view.company_name;
  const awaiting = countAwaitingResponse(view);

  return {
    version: 1,
    tenant,
    suite: "sales",
    view_id: "inbound",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "インバウンド問合せ",
    summary: `未対応 ${awaiting} 件 · オープン ${view.open_inquiries} 件 · アラート ${view.alerts.length} 件`,
    eyebrow: company,
    sections: [
      {
        type: "stats",
        items: [
          {
            value: String(awaiting),
            label: "未対応",
            tone: awaiting > 0 ? "warning" : "neutral",
          },
          {
            value: String(view.open_inquiries),
            label: "オープン",
            tone: "info",
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
        rows: INBOUND_STATUSES.map((s) => [s, String(view.by_status[s])]),
      },
      {
        type: "table",
        title: "アラート（上位 12 件）",
        headers: ["問合せID", "会社", "種別", "ステータス", "残日数"],
        rows: view.alerts.slice(0, 12).map((a) => [
          a.inquiry_id,
          a.company,
          a.alert_type,
          a.status,
          String(a.days_remaining),
        ]),
      },
    ],
    links: {
      web_path: `/t/${tenant}/sales/inbound`,
      present_cmd: "orgos sales inbound",
    },
  };
}
