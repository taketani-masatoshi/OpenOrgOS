/**
 * Customer success board — read-only Canvas View Model.
 */
import type { CanvasViewModel } from "../../../../schemas/canvas-view.js";
import { buildCustomerSuccessView } from "../../customer-success-view.js";
import { getTenantId } from "../../tenant.js";
import { currentDate } from "../../utils.js";

export function buildCustomerSuccessCanvasViewModel(opts?: {
  updatedAt?: string;
  tenant?: string;
  reportDate?: string;
  companyName?: string;
  includeDemo?: boolean;
  horizonDays?: number;
}): CanvasViewModel {
  const tenant = opts?.tenant?.trim() || getTenantId() || "mal";
  const reportDate = opts?.reportDate?.trim() || currentDate();
  const updatedAt = opts?.updatedAt?.trim() || `更新: ${reportDate}`;
  const view = buildCustomerSuccessView({
    includeDemo: opts?.includeDemo ?? false,
    horizonDays: opts?.horizonDays,
  });
  const company = opts?.companyName?.trim() || view.company_name;
  const atRisk = view.by_health.at_risk + view.by_health.critical;

  return {
    version: 1,
    tenant,
    suite: "sales",
    view_id: "customers",
    updated_at: updatedAt,
    report_date: reportDate,
    title: "カスタマーサクセス",
    summary: `顧客 ${view.total_accounts} 件 · 要警戒 ${atRisk} · 更新 ${view.renewal_alerts.length} · drift ${view.drift_count}`,
    eyebrow: company,
    sections: [
      {
        type: "stats",
        items: [
          {
            value: String(view.total_accounts),
            label: "顧客数",
            tone: "info",
          },
          {
            value: String(atRisk),
            label: "at_risk+critical",
            tone: atRisk > 0 ? "warning" : "neutral",
          },
          {
            value: String(view.renewal_alerts.length),
            label: "更新期日",
            tone: view.renewal_alerts.length > 0 ? "warning" : "neutral",
          },
          {
            value: String(view.drift_count),
            label: "drift",
            tone: view.drift_count > 0 ? "warning" : "neutral",
          },
        ],
      },
      {
        type: "table",
        title: "ヘルス内訳",
        headers: ["状態", "件数"],
        rows: [
          ["healthy", String(view.by_health.healthy)],
          ["at_risk", String(view.by_health.at_risk)],
          ["critical", String(view.by_health.critical)],
          ["churned", String(view.by_health.churned)],
        ],
      },
      {
        type: "table",
        title: "更新期日（上位 12 件）",
        headers: ["顧客ID", "会社", "更新日", "残日数", "ヘルス"],
        rows: view.renewal_alerts.slice(0, 12).map((r) => [
          r.account_id,
          r.company,
          r.renewal_date,
          String(r.days_remaining),
          r.health,
        ]),
      },
      {
        type: "table",
        title: "オンボーディング遅延（上位 8 件）",
        headers: ["顧客ID", "会社", "マイルストーン", "超過日数"],
        rows: view.onboarding_overdue.slice(0, 8).map((o) => [
          o.account_id,
          o.company,
          o.milestone_key,
          String(o.days_overdue),
        ]),
      },
    ],
    links: {
      web_path: `/t/${tenant}/sales/customers`,
      present_cmd: "orgos sales customers --scores",
    },
  };
}
