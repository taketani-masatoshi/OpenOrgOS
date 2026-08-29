/**
 * Executive L1 sales pipeline view (counts, weighted pipeline, stale deals).
 * Reuses loadSalesPipeline — no contact email/phone / L2.
 */
import type { SalesDeal, SalesDealStage } from "../../schemas/index.js";
import { loadCompany, loadSalesPipeline } from "./data.js";
import { excludeDemo } from "./demo-filter.js";
import { currentDate, daysBetween } from "./utils.js";
import {
  isOpenSalesDeal,
  OPEN_SALES_STAGES,
} from "../../schemas/sales.js";

const DEFAULT_STALE_DAYS = 14;
const DEFAULT_ACTION_HORIZON_DAYS = 14;

export interface SalesDealAlert {
  deal_id: string;
  title: string;
  counterparty: string;
  alert_type: "overdue_action" | "stale_stage" | "close_soon";
  deadline?: string;
  days_remaining: number;
  stage: SalesDealStage;
  summary: string;
}

export interface SalesPipelineView {
  company_name: string;
  as_of: string;
  stale_days: number;
  action_horizon_days: number;
  include_demo: boolean;
  total_deals: number;
  open_deals: number;
  by_stage: Record<SalesDealStage, number>;
  weighted_pipeline_man: number;
  won_count: number;
  lost_count: number;
  alerts: SalesDealAlert[];
  notes: string[];
}

function dealCounterparty(deal: SalesDeal): string {
  return deal.counterparty ?? deal.party?.company ?? "—";
}

function filterDeals(
  deals: SalesDeal[],
  includeDemo: boolean,
): SalesDeal[] {
  return excludeDemo(deals, includeDemo);
}

function countByStage(deals: SalesDeal[]): SalesPipelineView["by_stage"] {
  const by: SalesPipelineView["by_stage"] = {
    lead: 0,
    qualify: 0,
    proposal: 0,
    negotiation: 0,
    won: 0,
    lost: 0,
  };
  for (const d of deals) {
    by[d.stage] += 1;
  }
  return by;
}

function weightedPipelineMan(deals: SalesDeal[]): number {
  let total = 0;
  for (const d of deals) {
    if (!isOpenSalesDeal(d)) continue;
    const amount = d.amount_man ?? 0;
    const prob = d.probability_pct ?? 0;
    total += (amount * prob) / 100;
  }
  return Math.round(total * 10) / 10;
}

export function collectSalesDealAlerts(
  deals: SalesDeal[],
  opts?: {
    staleDays?: number;
    actionHorizonDays?: number;
    asOf?: string;
  },
): SalesDealAlert[] {
  const staleDays = opts?.staleDays ?? DEFAULT_STALE_DAYS;
  const actionHorizonDays = opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS;
  const asOf = opts?.asOf ?? currentDate();
  const out: SalesDealAlert[] = [];

  for (const d of deals) {
    if (!isOpenSalesDeal(d)) continue;
    const counterparty = dealCounterparty(d);

    if (d.next_action_due) {
      const remaining = daysBetween(asOf, d.next_action_due);
      if (remaining < 0) {
        out.push({
          deal_id: d.id,
          title: d.title,
          counterparty,
          alert_type: "overdue_action",
          deadline: d.next_action_due,
          days_remaining: remaining,
          stage: d.stage,
          summary: d.next_action ?? "next_action",
        });
      } else if (remaining <= actionHorizonDays) {
        out.push({
          deal_id: d.id,
          title: d.title,
          counterparty,
          alert_type: "close_soon",
          deadline: d.next_action_due,
          days_remaining: remaining,
          stage: d.stage,
          summary: d.next_action ?? "next_action",
        });
      }
    }

    if (d.stage_entered_on) {
      const inStage = daysBetween(d.stage_entered_on, asOf);
      if (inStage >= staleDays) {
        out.push({
          deal_id: d.id,
          title: d.title,
          counterparty,
          alert_type: "stale_stage",
          days_remaining: inStage,
          stage: d.stage,
          summary: `ステージ ${d.stage} に ${inStage} 日`,
        });
      }
    }
  }

  out.sort((a, b) => a.days_remaining - b.days_remaining);
  return out;
}

export function buildSalesPipelineView(opts?: {
  staleDays?: number;
  actionHorizonDays?: number;
  includeDemo?: boolean;
  pipeline?: ReturnType<typeof loadSalesPipeline>;
}): SalesPipelineView {
  const includeDemo = opts?.includeDemo ?? false;
  const pipeline = opts?.pipeline ?? loadSalesPipeline();
  const company = loadCompany();
  const asOf = currentDate();
  const allDeals = pipeline?.deals ?? [];
  const deals = filterDeals(allDeals, includeDemo);
  const openDeals = deals.filter(isOpenSalesDeal);
  const notes: string[] = [];

  if (!includeDemo && allDeals.some((d) => d.demo === true)) {
    notes.push("demo: true の商談を集計から除外しています（--include-demo で含める）。");
  }
  if (deals.length === 0 && allDeals.length > 0 && !includeDemo) {
    notes.push("実商談 0 件（全件 demo）。本番 KPI は demo 除外後に確認してください。");
  }

  return {
    company_name: company.name,
    as_of: asOf,
    stale_days: opts?.staleDays ?? DEFAULT_STALE_DAYS,
    action_horizon_days: opts?.actionHorizonDays ?? DEFAULT_ACTION_HORIZON_DAYS,
    include_demo: includeDemo,
    total_deals: deals.length,
    open_deals: openDeals.length,
    by_stage: countByStage(deals),
    weighted_pipeline_man: weightedPipelineMan(deals),
    won_count: deals.filter((d) => d.stage === "won").length,
    lost_count: deals.filter((d) => d.stage === "lost").length,
    alerts: collectSalesDealAlerts(deals, {
      staleDays: opts?.staleDays,
      actionHorizonDays: opts?.actionHorizonDays,
      asOf,
    }),
    notes,
  };
}

function alertTypeJa(type: SalesDealAlert["alert_type"]): string {
  switch (type) {
    case "overdue_action":
      return "期限超過";
    case "stale_stage":
      return "停滞";
    case "close_soon":
      return "期限間近";
  }
}

export function formatSalesPipelineMarkdown(view: SalesPipelineView): string {
  const openStageLines = OPEN_SALES_STAGES.map(
    (s) => `- ${s}: ${view.by_stage[s]}`,
  );
  const lines = [
    `# 営業パイプライン — ${view.company_name}`,
    "",
    `**基準日:** ${view.as_of}`,
    `**SoT Path:** \`data/sales/pipeline.yaml\``,
    `**商談数:** **${view.total_deals}**（オープン ${view.open_deals} · 受注 ${view.won_count} · 失注 ${view.lost_count}）`,
    `**加重パイプライン:** **${view.weighted_pipeline_man}** 万円（amount_man × probability_pct）`,
    "",
    "## ステージ別（オープン含む全件）",
    ...openStageLines,
    `- won: ${view.by_stage.won}`,
    `- lost: ${view.by_stage.lost}`,
    "",
    `## アラート（期限超過 · 停滞 ${view.stale_days} 日以上 · 期限 ${view.action_horizon_days} 日以内）`,
  ];

  if (view.alerts.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push(
      "",
      "| 商談ID | 取引先 | 種別 | ステージ | 残日数 | 摘要 |",
      "|---|---|---|---|---:|---|",
    );
    for (const a of view.alerts) {
      lines.push(
        `| ${a.deal_id} | ${a.counterparty} | ${alertTypeJa(a.alert_type)} | ${a.stage} | ${a.days_remaining} | ${a.summary} |`,
      );
    }
  }

  if (view.notes.length > 0) {
    lines.push("", "## 注記", ...view.notes.map((n) => `- ${n}`));
  }

  lines.push(
    "",
    "担当者メール · 電話は出しません（L1 台帳のみ）。詳細は Sales Lead へ委譲してください。",
    "",
    "```bash",
    "npm run orgos -- sales summary",
    "npm run orgos -- skills run sales-pipeline",
    "```",
  );
  return lines.join("\n");
}

export function formatSalesPipelineCeoReply(view: SalesPipelineView): string {
  const lines = [
    `商談 **${view.open_deals}** 件オープン（全 ${view.total_deals} 件 · 受注 ${view.won_count} · 失注 ${view.lost_count}）。`,
    `加重パイプライン **${view.weighted_pipeline_man}** 万円。`,
  ];
  const nearest = view.alerts[0];
  if (nearest) {
    lines.push(
      `直近アラート: ${nearest.counterparty}（${alertTypeJa(nearest.alert_type)} · ${nearest.summary}）。`,
    );
  } else {
    lines.push("期限超過 · 停滞商談のアラートなし。");
  }
  return lines.join("\n");
}

export function formatSalesPipelineTodayLines(view: SalesPipelineView): string[] {
  const overdue = view.alerts.filter((a) => a.alert_type === "overdue_action");
  const stale = view.alerts.filter((a) => a.alert_type === "stale_stage");
  const nearest = view.alerts[0];
  return [
    `- 商談: オープン ${view.open_deals} / 全 ${view.total_deals}（受注 ${view.won_count} · 失注 ${view.lost_count}）`,
    `- 加重パイプライン: ${view.weighted_pipeline_man} 万円`,
    `- アラート: ${view.alerts.length} 件（期限超過 ${overdue.length} · 停滞 ${stale.length}）` +
      (nearest
        ? `（直近 ${nearest.deal_id} ${alertTypeJa(nearest.alert_type)}）`
        : ""),
  ];
}

/** Weighted forecast for a target month (open deals with close_date_target in month). */
export function buildSalesForecastView(opts?: {
  month?: string;
  includeDemo?: boolean;
  pipeline?: ReturnType<typeof loadSalesPipeline>;
}): {
  month: string;
  forecast_man: number;
  deal_count: number;
  deals: Array<{ id: string; title: string; counterparty: string; amount_man: number; probability_pct: number }>;
} {
  const month = opts?.month ?? currentDate().slice(0, 7);
  const includeDemo = opts?.includeDemo ?? false;
  const pipeline = opts?.pipeline ?? loadSalesPipeline();
  const deals = filterDeals(pipeline?.deals ?? [], includeDemo).filter(
    (d) => isOpenSalesDeal(d) && d.close_date_target?.startsWith(month),
  );
  let forecast = 0;
  const rows = deals.map((d) => {
    const amount = d.amount_man ?? 0;
    const prob = d.probability_pct ?? 0;
    forecast += (amount * prob) / 100;
    return {
      id: d.id,
      title: d.title,
      counterparty: dealCounterparty(d),
      amount_man: amount,
      probability_pct: prob,
    };
  });
  return {
    month,
    forecast_man: Math.round(forecast * 10) / 10,
    deal_count: deals.length,
    deals: rows,
  };
}

export function formatSalesForecastMarkdown(
  forecast: ReturnType<typeof buildSalesForecastView>,
): string {
  const lines = [
    `# 受注予測 — ${forecast.month}`,
    "",
    `**対象月クローズ想定:** ${forecast.deal_count} 件`,
    `**加重予測:** **${forecast.forecast_man}** 万円`,
    "",
    "## 対象商談",
  ];
  if (forecast.deals.length === 0) {
    lines.push("該当なし。");
  } else {
    lines.push(
      "",
      "| 商談ID | 取引先 | 金額(万) | 確度% |",
      "|---|---|---:|---:|",
    );
    for (const d of forecast.deals) {
      lines.push(
        `| ${d.id} | ${d.counterparty} | ${d.amount_man} | ${d.probability_pct} |`,
      );
    }
  }
  lines.push(
    "",
    "```bash",
    "npm run orgos -- sales forecast --month " + forecast.month,
    "```",
  );
  return lines.join("\n");
}
