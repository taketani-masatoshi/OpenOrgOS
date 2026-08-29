/**
 * Executive L1 outbound campaign view (counts, contact coverage, alerts).
 * Reuses loadSalesOutboundCampaigns — no contact lists / L2.
 */
import type {
  SalesOutboundCampaign,
  SalesOutboundCampaignStatus,
} from "../../schemas/index.js";
import { loadCompany, loadSalesOutboundCampaigns } from "./data.js";
import { excludeDemo } from "./demo-filter.js";
import { currentDate, daysBetween } from "./utils.js";

const DEFAULT_ACTION_HORIZON_DAYS = 7;
const DEFAULT_LOW_COVERAGE_PCT = 30;

export type SalesOutboundAlertType =
  | "overdue_action"
  | "due_soon"
  | "draft_no_due"
  | "low_coverage";

const ALERT_SEVERITY: Record<SalesOutboundAlertType, number> = {
  overdue_action: 0,
  due_soon: 1,
  low_coverage: 2,
  draft_no_due: 3,
};

export interface SalesOutboundAlert {
  campaign_id: string;
  name: string;
  alert_type: SalesOutboundAlertType;
  status: SalesOutboundCampaignStatus;
  deadline?: string;
  /** Days until next_action_due; omitted for low_coverage and draft_no_due. */
  days_remaining?: number;
  coverage_pct?: number;
  summary: string;
}

export interface SalesOutboundCoverage {
  campaign_id: string;
  name: string;
  status: SalesOutboundCampaignStatus;
  target_count?: number;
  contacted_count?: number;
  coverage_pct?: number;
}

export interface SalesOutboundView {
  company_name: string;
  as_of: string;
  action_horizon_days: number;
  low_coverage_pct: number;
  include_demo: boolean;
  total_campaigns: number;
  active_campaigns: number;
  by_status: Record<SalesOutboundCampaignStatus, number>;
  coverage_rows: SalesOutboundCoverage[];
  /** Weighted contact coverage for active campaigns with target_count only. */
  aggregate_coverage_pct?: number;
  alerts: SalesOutboundAlert[];
  notes: string[];
}

function countByStatus(
  campaigns: SalesOutboundCampaign[],
): SalesOutboundView["by_status"] {
  const by: SalesOutboundView["by_status"] = {
    draft: 0,
    active: 0,
    paused: 0,
    completed: 0,
  };
  for (const c of campaigns) {
    by[c.status] += 1;
  }
  return by;
}

function coveragePct(campaign: SalesOutboundCampaign): number | undefined {
  if (campaign.target_count == null || campaign.target_count <= 0) return undefined;
  const contacted = campaign.contacted_count ?? 0;
  return Math.round((contacted / campaign.target_count) * 1000) / 10;
}

export function buildCoverageRows(
  campaigns: SalesOutboundCampaign[],
): SalesOutboundCoverage[] {
  return campaigns.map((c) => ({
    campaign_id: c.id,
    name: c.name,
    status: c.status,
    target_count: c.target_count,
    contacted_count: c.contacted_count,
    coverage_pct: coveragePct(c),
  }));
}

export function aggregateCoveragePct(
  rows: SalesOutboundCoverage[],
): number | undefined {
  const measurable = rows.filter(
    (r) => r.target_count != null && r.target_count > 0,
  );
  if (measurable.length === 0) return undefined;
  const totalTarget = measurable.reduce((sum, r) => sum + (r.target_count ?? 0), 0);
  const totalContacted = measurable.reduce(
    (sum, r) => sum + (r.contacted_count ?? 0),
    0,
  );
  if (totalTarget <= 0) return undefined;
  return Math.round((totalContacted / totalTarget) * 1000) / 10;
}

export function sortSalesOutboundAlerts(
  alerts: SalesOutboundAlert[],
): SalesOutboundAlert[] {
  return [...alerts].sort((a, b) => {
    const severityDiff =
      ALERT_SEVERITY[a.alert_type] - ALERT_SEVERITY[b.alert_type];
    if (severityDiff !== 0) return severityDiff;
    const aDays = a.days_remaining ?? Number.POSITIVE_INFINITY;
    const bDays = b.days_remaining ?? Number.POSITIVE_INFINITY;
    return aDays - bDays;
  });
}

export function collectSalesOutboundAlerts(
  campaigns: SalesOutboundCampaign[],
  opts?: {
    actionHorizonDays?: number;
    lowCoveragePct?: number;
    asOf?: string;
  },
): SalesOutboundAlert[] {
  const actionHorizonDays = opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS;
  const lowCoveragePct = opts?.lowCoveragePct ?? DEFAULT_LOW_COVERAGE_PCT;
  const asOf = opts?.asOf ?? currentDate();
  const out: SalesOutboundAlert[] = [];

  for (const c of campaigns) {
    if (c.status === "completed") continue;

    if (c.status === "draft" && !c.next_action_due) {
      out.push({
        campaign_id: c.id,
        name: c.name,
        alert_type: "draft_no_due",
        status: c.status,
        summary: "draft のまま next_action_due 未設定",
      });
    }

    if (c.next_action_due) {
      const remaining = daysBetween(asOf, c.next_action_due);
      if (remaining < 0) {
        out.push({
          campaign_id: c.id,
          name: c.name,
          alert_type: "overdue_action",
          status: c.status,
          deadline: c.next_action_due,
          days_remaining: remaining,
          summary: c.next_action ?? "next_action",
        });
      } else if (remaining <= actionHorizonDays) {
        out.push({
          campaign_id: c.id,
          name: c.name,
          alert_type: "due_soon",
          status: c.status,
          deadline: c.next_action_due,
          days_remaining: remaining,
          summary: c.next_action ?? "next_action",
        });
      }
    }

    if (c.status === "active") {
      const pct = coveragePct(c);
      if (
        pct != null &&
        pct < lowCoveragePct &&
        c.target_count != null &&
        c.target_count > 0
      ) {
        out.push({
          campaign_id: c.id,
          name: c.name,
          alert_type: "low_coverage",
          status: c.status,
          coverage_pct: pct,
          summary: `接触率 ${pct}%（閾値 ${lowCoveragePct}% 未満 · ${c.contacted_count ?? 0}/${c.target_count}）`,
        });
      }
    }
  }

  return sortSalesOutboundAlerts(out);
}

export function buildSalesOutboundView(opts?: {
  actionHorizonDays?: number;
  lowCoveragePct?: number;
  includeDemo?: boolean;
  campaigns?: ReturnType<typeof loadSalesOutboundCampaigns>;
}): SalesOutboundView {
  const includeDemo = opts?.includeDemo ?? false;
  const file = opts?.campaigns ?? loadSalesOutboundCampaigns();
  const company = loadCompany();
  const asOf = currentDate();
  const allCampaigns = file?.campaigns ?? [];
  const campaigns = excludeDemo(allCampaigns, includeDemo);
  const coverageRows = buildCoverageRows(campaigns);
  const notes: string[] = [];

  if (!includeDemo && allCampaigns.some((c) => c.demo === true)) {
    notes.push("demo: true の施策を集計から除外しています（--include-demo で含める）。");
  }
  if (campaigns.length === 0 && allCampaigns.length > 0 && !includeDemo) {
    notes.push("実施策 0 件（全件 demo）。本番 KPI は demo 除外後に確認してください。");
  }

  const activeWithoutTarget = campaigns.filter(
    (c) => c.status === "active" && c.target_count == null,
  );
  if (activeWithoutTarget.length > 0) {
    notes.push(
      `active かつ target_count 未設定: ${activeWithoutTarget.map((c) => c.id).join(", ")}（接触率集計から除外）`,
    );
  }

  return {
    company_name: company.name,
    as_of: asOf,
    action_horizon_days: opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS,
    low_coverage_pct: opts?.lowCoveragePct ?? DEFAULT_LOW_COVERAGE_PCT,
    include_demo: includeDemo,
    total_campaigns: campaigns.length,
    active_campaigns: campaigns.filter((c) => c.status === "active").length,
    by_status: countByStatus(campaigns),
    coverage_rows: coverageRows,
    aggregate_coverage_pct: aggregateCoveragePct(
      coverageRows.filter((r) => r.status === "active"),
    ),
    alerts: collectSalesOutboundAlerts(campaigns, {
      actionHorizonDays: opts?.actionHorizonDays,
      lowCoveragePct: opts?.lowCoveragePct,
      asOf,
    }),
    notes,
  };
}

function alertTypeJa(type: SalesOutboundAlertType): string {
  switch (type) {
    case "overdue_action":
      return "期限超過";
    case "due_soon":
      return "期限間近";
    case "draft_no_due":
      return "due未設定";
    case "low_coverage":
      return "接触率低";
  }
}

function formatAlertDaysRemaining(alert: SalesOutboundAlert): string {
  if (alert.days_remaining != null) return String(alert.days_remaining);
  return "—";
}

export function formatSalesOutboundMarkdown(view: SalesOutboundView): string {
  const statusLines = (["draft", "active", "paused", "completed"] as const).map(
    (s) => `- ${s}: ${view.by_status[s]}`,
  );
  const coverageSummary =
    view.aggregate_coverage_pct != null
      ? `**${view.aggregate_coverage_pct}%**（active 施策の合算）`
      : "—（active かつ target_count 設定施策なし）";

  const lines = [
    `# アウトバウンド施策 — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**SoT Path:** \`data/sales/outbound/campaigns.yaml\``,
    `**施策数:** **${view.total_campaigns}**（active ${view.active_campaigns}）`,
    `**接触カバレッジ:** ${coverageSummary}`,
    "",
    "## ステータス別",
    ...statusLines,
    "",
    `## アラート（期限 ${view.action_horizon_days} 日以内 · 接触率 ${view.low_coverage_pct}% 未満）`,
  ];

  if (view.alerts.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push(
      "",
      "| 施策ID | 名称 | 種別 | ステータス | 残日数 | 摘要 |",
      "|---|---|---|---|---:|---|",
    );
    for (const a of view.alerts) {
      lines.push(
        `| ${a.campaign_id} | ${a.name} | ${alertTypeJa(a.alert_type)} | ${a.status} | ${formatAlertDaysRemaining(a)} | ${a.summary} |`,
      );
    }
  }

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "リスト連絡先 · メール本文は出しません（L1 台帳のみ）。詳細は Sales Outbound へ委譲してください。",
    "",
    "```bash",
    "npm run orgos -- sales outbound",
    "npm run orgos -- skills run sales-outbound",
    "```",
  );
  return lines.join("\n");
}

export function formatSalesOutboundCeoReply(view: SalesOutboundView): string {
  const overdue = view.alerts.filter((a) => a.alert_type === "overdue_action");
  const lowCoverage = view.alerts.filter((a) => a.alert_type === "low_coverage");
  const coverage =
    view.aggregate_coverage_pct != null
      ? `${view.aggregate_coverage_pct}%`
      : "—";
  const lines = [
    `施策 **${view.total_campaigns}** 件（active ${view.active_campaigns} · 接触率 ${coverage}）。`,
    `アラート **${view.alerts.length}** 件（期限超過 ${overdue.length} · 接触率低 ${lowCoverage.length}）。`,
  ];
  const nearest = view.alerts[0];
  if (nearest) {
    lines.push(
      `直近アラート: ${nearest.name}（${alertTypeJa(nearest.alert_type)} · ${nearest.summary}）。`,
    );
  } else {
    lines.push("期限超過 · 接触率低のアラートなし。");
  }
  return lines.join("\n");
}

export function formatSalesOutboundTodayLines(view: SalesOutboundView): string[] {
  const overdue = view.alerts.filter((a) => a.alert_type === "overdue_action");
  const lowCoverage = view.alerts.filter((a) => a.alert_type === "low_coverage");
  const nearest = view.alerts[0];
  const coverage =
    view.aggregate_coverage_pct != null
      ? `${view.aggregate_coverage_pct}%`
      : "—";
  return [
    `- 施策: active ${view.active_campaigns} / 全 ${view.total_campaigns}（接触率 ${coverage}）`,
    `- ステータス: draft ${view.by_status.draft} · active ${view.by_status.active} · paused ${view.by_status.paused} · completed ${view.by_status.completed}`,
    `- アラート: ${view.alerts.length} 件（期限超過 ${overdue.length} · 接触率低 ${lowCoverage.length}）` +
      (nearest
        ? `（直近 ${nearest.campaign_id} ${alertTypeJa(nearest.alert_type)}）`
        : ""),
  ];
}
