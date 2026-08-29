/**
 * Executive L1 inbound inquiry view (counts, SLA alerts, qualified gaps).
 * Reuses loadSalesInquiries — no contact email/phone / L2.
 */
import type { SalesInquiry, SalesInquiryStatus } from "../../schemas/index.js";
import { loadCompany, loadSalesInquiries, loadSalesPipeline } from "./data.js";
import { excludeDemo } from "./demo-filter.js";
import { currentDate, daysBetween } from "./utils.js";

const DEFAULT_STALE_DAYS = 3;
const DEFAULT_ACTION_HORIZON_DAYS = 7;

export interface SalesInquiryAlert {
  inquiry_id: string;
  subject: string;
  company: string;
  alert_type: "overdue_action" | "stale_new" | "due_soon";
  deadline?: string;
  days_remaining: number;
  status: SalesInquiryStatus;
  summary: string;
}

export interface SalesInboundView {
  company_name: string;
  as_of: string;
  stale_days: number;
  action_horizon_days: number;
  include_demo: boolean;
  total_inquiries: number;
  open_inquiries: number;
  by_status: Record<SalesInquiryStatus, number>;
  alerts: SalesInquiryAlert[];
  notes: string[];
}

function filterInquiries(
  inquiries: SalesInquiry[],
  includeDemo: boolean,
): SalesInquiry[] {
  return excludeDemo(inquiries, includeDemo);
}

function countByStatus(inquiries: SalesInquiry[]): SalesInboundView["by_status"] {
  const by: SalesInboundView["by_status"] = {
    new: 0,
    triaged: 0,
    responded: 0,
    qualified: 0,
    closed: 0,
  };
  for (const i of inquiries) {
    by[i.status] += 1;
  }
  return by;
}

function isOpenInquiry(inquiry: SalesInquiry): boolean {
  return inquiry.status !== "closed";
}

function isAwaitingResponse(inquiry: SalesInquiry): boolean {
  return inquiry.status === "new" || inquiry.status === "triaged";
}

function pipelineHasDealForInquiry(
  inquiry: SalesInquiry,
  pipeline: ReturnType<typeof loadSalesPipeline>,
): boolean {
  if (!pipeline) return false;
  const company = inquiry.company.trim().toLowerCase();
  if (!company) return false;
  return pipeline.deals.some((deal) => {
    const counterparty = (deal.counterparty ?? deal.party?.company ?? "")
      .trim()
      .toLowerCase();
    return counterparty.length > 0 && counterparty === company;
  });
}

export function collectSalesInquiryAlerts(
  inquiries: SalesInquiry[],
  opts?: {
    staleDays?: number;
    actionHorizonDays?: number;
    asOf?: string;
  },
): SalesInquiryAlert[] {
  const staleDays = opts?.staleDays ?? DEFAULT_STALE_DAYS;
  const actionHorizonDays = opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS;
  const asOf = opts?.asOf ?? currentDate();
  const out: SalesInquiryAlert[] = [];

  for (const i of inquiries) {
    if (i.status === "closed") continue;

    if (i.status === "new" && i.received_on) {
      const age = daysBetween(i.received_on, asOf);
      if (age >= staleDays) {
        out.push({
          inquiry_id: i.id,
          subject: i.subject,
          company: i.company,
          alert_type: "stale_new",
          days_remaining: age,
          status: i.status,
          summary: `初動 SLA 超過（${age} 日 · received_on ${i.received_on}）`,
        });
      }
    }

    if (i.next_action_due) {
      const remaining = daysBetween(asOf, i.next_action_due);
      if (remaining < 0) {
        out.push({
          inquiry_id: i.id,
          subject: i.subject,
          company: i.company,
          alert_type: "overdue_action",
          deadline: i.next_action_due,
          days_remaining: remaining,
          status: i.status,
          summary: i.next_action ?? "next_action",
        });
      } else if (remaining <= actionHorizonDays) {
        out.push({
          inquiry_id: i.id,
          subject: i.subject,
          company: i.company,
          alert_type: "due_soon",
          deadline: i.next_action_due,
          days_remaining: remaining,
          status: i.status,
          summary: i.next_action ?? "next_action",
        });
      }
    }
  }

  out.sort((a, b) => a.days_remaining - b.days_remaining);
  return out;
}

export function buildSalesInboundView(opts?: {
  staleDays?: number;
  actionHorizonDays?: number;
  includeDemo?: boolean;
  inquiries?: ReturnType<typeof loadSalesInquiries>;
  pipeline?: ReturnType<typeof loadSalesPipeline>;
}): SalesInboundView {
  const includeDemo = opts?.includeDemo ?? false;
  const file = opts?.inquiries ?? loadSalesInquiries();
  const pipeline = opts?.pipeline ?? loadSalesPipeline();
  const company = loadCompany();
  const asOf = currentDate();
  const allInquiries = file?.inquiries ?? [];
  const inquiries = filterInquiries(allInquiries, includeDemo);
  const openInquiries = inquiries.filter(isOpenInquiry);
  const notes: string[] = [];

  if (!includeDemo && allInquiries.some((i) => i.demo === true)) {
    notes.push("demo: true の問合せを集計から除外しています（--include-demo で含める）。");
  }
  if (inquiries.length === 0 && allInquiries.length > 0 && !includeDemo) {
    notes.push("実問合せ 0 件（全件 demo）。本番 KPI は demo 除外後に確認してください。");
  }

  const qualifiedWithoutDeal = inquiries.filter(
    (i) => i.status === "qualified" && !pipelineHasDealForInquiry(i, pipeline),
  );
  if (qualifiedWithoutDeal.length > 0) {
    notes.push(
      `qualified だがパイプライン商談未連携: ${qualifiedWithoutDeal.map((i) => i.id).join(", ")}`,
    );
  }

  return {
    company_name: company.name,
    as_of: asOf,
    stale_days: opts?.staleDays ?? DEFAULT_STALE_DAYS,
    action_horizon_days: opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS,
    include_demo: includeDemo,
    total_inquiries: inquiries.length,
    open_inquiries: openInquiries.length,
    by_status: countByStatus(inquiries),
    alerts: collectSalesInquiryAlerts(inquiries, {
      staleDays: opts?.staleDays,
      actionHorizonDays: opts?.actionHorizonDays,
      asOf,
    }),
    notes,
  };
}

export function countAwaitingResponse(view: SalesInboundView): number {
  return view.by_status.new + view.by_status.triaged;
}

function alertTypeJa(type: SalesInquiryAlert["alert_type"]): string {
  switch (type) {
    case "overdue_action":
      return "期限超過";
    case "stale_new":
      return "初動SLA超過";
    case "due_soon":
      return "期限間近";
  }
}

export function formatSalesInboundMarkdown(view: SalesInboundView): string {
  const statusLines = (
    ["new", "triaged", "responded", "qualified", "closed"] as const
  ).map((s) => `- ${s}: ${view.by_status[s]}`);
  const lines = [
    `# インバウンド問合せ — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**SoT Path:** \`data/sales/inbound/inquiries.yaml\``,
    `**問合せ数:** **${view.total_inquiries}**（未クローズ ${view.open_inquiries} · 未対応 ${countAwaitingResponse(view)}）`,
    "",
    "## ステータス別",
    ...statusLines,
    "",
    `## アラート（初動 SLA ${view.stale_days} 日 · 期限 ${view.action_horizon_days} 日以内）`,
  ];

  if (view.alerts.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push(
      "",
      "| 問合せID | 会社 | 種別 | ステータス | 残日数 | 摘要 |",
      "|---|---|---|---|---:|---|",
    );
    for (const a of view.alerts) {
      lines.push(
        `| ${a.inquiry_id} | ${a.company} | ${alertTypeJa(a.alert_type)} | ${a.status} | ${a.days_remaining} | ${a.summary} |`,
      );
    }
  }

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "差出人メール · 電話 · 本文は出しません（L1 台帳のみ）。詳細は Sales Inbound へ委譲してください。",
    "",
    "```bash",
    "npm run orgos -- sales inbound",
    "npm run orgos -- skills run sales-inbound",
    "```",
  );
  return lines.join("\n");
}

export function formatSalesInboundCeoReply(view: SalesInboundView): string {
  const awaiting = countAwaitingResponse(view);
  const stale = view.alerts.filter((a) => a.alert_type === "stale_new");
  const overdue = view.alerts.filter((a) => a.alert_type === "overdue_action");
  const lines = [
    `問合せ **${view.open_inquiries}** 件オープン（全 ${view.total_inquiries} 件 · 未対応 ${awaiting}）。`,
    `アラート **${view.alerts.length}** 件（初動 SLA 超過 ${stale.length} · 期限超過 ${overdue.length}）。`,
  ];
  const nearest = view.alerts[0];
  if (nearest) {
    lines.push(
      `直近アラート: ${nearest.company}（${alertTypeJa(nearest.alert_type)} · ${nearest.summary}）。`,
    );
  } else {
    lines.push("初動 SLA 超過 · 期限超過のアラートなし。");
  }
  return lines.join("\n");
}

export function formatSalesInboundTodayLines(view: SalesInboundView): string[] {
  const awaiting = countAwaitingResponse(view);
  const stale = view.alerts.filter((a) => a.alert_type === "stale_new");
  const overdue = view.alerts.filter((a) => a.alert_type === "overdue_action");
  const nearest = view.alerts[0];
  return [
    `- 問合せ: 未クローズ ${view.open_inquiries} / 全 ${view.total_inquiries}（未対応 ${awaiting}）`,
    `- ステータス: new ${view.by_status.new} · triaged ${view.by_status.triaged} · responded ${view.by_status.responded} · qualified ${view.by_status.qualified}`,
    `- アラート: ${view.alerts.length} 件（初動 SLA 超過 ${stale.length} · 期限超過 ${overdue.length}）` +
      (nearest
        ? `（直近 ${nearest.inquiry_id} ${alertTypeJa(nearest.alert_type)}）`
        : ""),
  ];
}

export { isAwaitingResponse, isOpenInquiry, pipelineHasDealForInquiry };
