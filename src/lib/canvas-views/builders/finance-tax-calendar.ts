/**
 * Tax / social / lodging calendar board — read-only Canvas View Model.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import {
  buildTaxCalendarPortfolio,
  formatAmountEstimate,
} from "../../finance/tax-calendar-portfolio.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

export function buildFinanceTaxCalendarViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const updatedAt = opts?.updatedAt?.trim() || `更新: ${reportDate}`;
  const company = opts?.companyName?.trim() || tenant.toUpperCase();

  const portfolio = buildTaxCalendarPortfolio({ today: reportDate });
  const outflowLabel = formatAmountEstimate(portfolio.stats.outflow_3m_jpy);

  const upcoming = portfolio.rows
    .filter((row) => row.deadline >= reportDate)
    .slice(0, 24);

  return {
    version: 1,
    tenant,
    suite: "finance",
    view_id: "tax-calendar",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "税・社保・納付",
    summary: `先3ヶ月流出 ${outflowLabel} · 期限順 ${upcoming.length} 件`,
    eyebrow: company,
    sections: [
      {
        type: "stats",
        items: [
          {
            value: outflowLabel,
            label: "先3ヶ月概算流出",
            tone: "info",
          },
          {
            value: String(upcoming.length),
            label: "今後の期限",
            tone: "neutral",
          },
        ],
      },
      {
        type: "table",
        title: "期限順（概算付き）",
        headers: ["期限", "税目", "概算", "状態"],
        rows: upcoming.map((row) => [
          row.deadline,
          row.tax,
          row.amount_estimate_jpy != null
            ? formatAmountEstimate(row.amount_estimate_jpy)
            : "—",
          row.status ?? "—",
        ]),
      },
      {
        type: "calendar",
        title: "カレンダー",
        today: reportDate,
        events: portfolio.calendar_events.slice(0, 80),
      },
    ],
    links: {
      web_path: `/t/${tenant}/finance/tax-calendar`,
      present_cmd: "orgos tax calendar",
    },
  };
}
