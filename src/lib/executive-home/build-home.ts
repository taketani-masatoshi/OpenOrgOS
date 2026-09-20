/**
 * Compose Executive Home for Operator Console `/`.
 * Path: src/lib/executive-home/build-home.ts
 * ADR: docs/adr/0065-executive-home-console.md
 */
import {
  executiveHomeSchema,
  type ExecutiveAttentionItem,
  type ExecutiveGapRow,
  type ExecutiveHome,
  type ExecutiveWorkItem,
} from "../../../schemas/executive-home.js";
import { buildTodayContext } from "../steward-chat/today-context.js";
import { buildKpiScorecardView } from "../analytics/kpi-scorecard-view.js";
import { createMetricResolverCache } from "../analytics/resolvers.js";
import { buildSalesPipelineView } from "../sales-pipeline-view.js";
import { buildSalesInboundView } from "../sales-inbound-view.js";
import { buildCustomerSuccessView } from "../customer-success-view.js";
import { buildCustomerChurnView } from "../customer-churn-view.js";
import { computeVarianceReport } from "../variance.js";
import {
  buildOrchestrationBoardList,
  resolveWorkOrderTitle,
} from "../orchestration/board-view.js";
import { listHandoffs } from "../routing.js";
import { buildAgentInbox } from "../agent-inbox.js";
import { loadOperatorRegistry } from "../org/operators.js";
import { isClosedWorkOrder } from "../orchestration/work-order-state.js";
import { assigneeKind, assigneeLabel } from "./assignee-kind.js";

const MAX_ATTENTION = 24;
const MAX_WORK_PER_KIND = 12;

function formatTarget(
  value: number | null,
  unit: string,
): string | null {
  if (value == null) return null;
  if (unit === "yen") return `${Math.round(value).toLocaleString("ja-JP")} 円`;
  if (unit === "percent") return `${value}%`;
  if (unit === "months") return `${value} ヶ月`;
  return String(value);
}

/**
 * Summaries live at `.../agent-summaries/<agent>/<date>-<topic>.md`, so the file
 * name alone repeats across agents. Qualify it with the owning agent folder.
 */
function agentSummaryLabel(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const file = parts.at(-1) ?? path;
  const stem = file.replace(/\.md$/, "");
  const agent = parts.at(-2);
  return agent && agent !== "agent-summaries" ? `${agent} · ${stem}` : stem;
}

function collectAttention(today: ReturnType<typeof buildTodayContext>): ExecutiveAttentionItem[] {
  const items: ExecutiveAttentionItem[] = [];

  try {
    const pipeline = buildSalesPipelineView({ includeDemo: false });
    for (const a of pipeline.alerts.slice(0, 6)) {
      items.push({
        id: `deal:${a.deal_id}`,
        kind: "customer",
        title: `${a.counterparty || a.title}: ${a.summary}`,
        status: a.alert_type,
        href: "/customers/outbound/",
        severity: a.alert_type === "overdue_action" ? "p0" : "p1",
      });
    }
  } catch {
    /* sales module optional */
  }

  try {
    const inbound = buildSalesInboundView({ includeDemo: false });
    for (const a of inbound.alerts.slice(0, 4)) {
      items.push({
        id: `inq:${a.inquiry_id}`,
        kind: "customer",
        title: `${a.company || a.subject}: ${a.summary}`,
        status: a.alert_type,
        href: "/customers/inbound/",
        severity: a.alert_type === "overdue_action" ? "p0" : "p1",
      });
    }
  } catch {
    /* optional */
  }

  try {
    const cs = buildCustomerSuccessView({ includeDemo: false });
    for (const a of cs.renewal_alerts.slice(0, 4)) {
      items.push({
        id: `renewal:${a.account_id}`,
        kind: "customer",
        title: `${a.company}: 更新まで ${a.days_remaining} 日（${a.health}）`,
        status: "renewal",
        href: "/customers/after-sales/",
        severity: a.days_remaining <= 30 ? "p0" : "p1",
      });
    }
    for (const a of cs.onboarding_overdue.slice(0, 3)) {
      items.push({
        id: `onboard:${a.onboarding_id}`,
        kind: "customer",
        title: `${a.company}: オンボ遅延 ${a.days_overdue} 日`,
        status: "onboarding_overdue",
        href: "/customers/after-sales/",
        severity: "p1",
      });
    }
  } catch {
    /* optional */
  }

  try {
    const churn = buildCustomerChurnView({ includeDemo: false });
    for (const row of churn.accounts
      .filter((a) => a.reason === "at_risk" || a.reason === "critical" || a.reason === "dormant")
      .slice(0, 4)) {
      items.push({
        id: `churn:${row.account_id}`,
        kind: "customer",
        title: `${row.company}: ${row.summary}`,
        status: row.reason,
        href: "/customers/churn/",
        severity: row.reason === "critical" ? "p0" : "p1",
      });
    }
  } catch {
    /* optional */
  }

  for (const m of today.mail_intake_pending.slice(0, 5)) {
    items.push({
      id: `mail:${m.id}`,
      kind: "mail",
      title: m.subject,
      status: `${m.importance}/${m.urgency}`,
      href: "/approvals/",
      severity: m.importance === "p0" ? "p0" : "p1",
    });
  }

  for (const q of today.ceo_inline_questions_pending.slice(0, 5)) {
    items.push({
      id: `ceoq:${q.id}`,
      kind: "ceo_question",
      title: q.subject,
      status: "awaiting_answer",
      href: `/approvals/?ceo_question=${encodeURIComponent(q.id)}`,
      severity: "p0",
    });
  }

  for (const s of today.scheduling_cases_pending.slice(0, 5)) {
    items.push({
      id: `sched:${s.id}`,
      kind: "scheduling",
      title: s.headline || s.title,
      status: s.next_action,
      href: s.approval_id
        ? `/approvals/?id=${encodeURIComponent(s.approval_id)}`
        : "/approvals/",
      severity: "p1",
    });
  }

  for (const a of today.approvals.slice(0, 6)) {
    items.push({
      id: `apr:${a.id}`,
      kind: "approval",
      title: a.message || a.subject,
      status: a.status,
      href: `/approvals/?id=${encodeURIComponent(a.id)}`,
      severity: "p0",
    });
  }

  for (const w of today.wire_pending.slice(0, 4)) {
    items.push({
      id: `wire:${w.id}`,
      kind: "wire",
      title: w.subject,
      status: w.status_label,
      href: "/wire/",
      severity: "p1",
    });
  }

  try {
    const inbox = buildAgentInbox({ for: "executive_steward", limit: 20 });
    for (const item of inbox.items.filter((i) => i.unread).slice(0, 4)) {
      items.push({
        id: `handoff:${item.mission_id}`,
        kind: "handoff",
        title: `${item.agent_label}: ${item.subject}`,
        status: "unread",
        href: "/handoffs/",
        severity: "p1",
      });
    }
  } catch {
    /* inbox optional */
  }

  const severityRank = { p0: 0, p1: 1, p2: 2 } as const;
  items.sort(
    (a, b) =>
      (severityRank[a.severity ?? "p2"] ?? 2) -
      (severityRank[b.severity ?? "p2"] ?? 2),
  );
  return items.slice(0, MAX_ATTENTION);
}

function collectGaps(
  kpi: ReturnType<typeof buildKpiScorecardView>,
): { gaps: ExecutiveGapRow[]; summary: ExecutiveHome["gap_summary"] } {
  const gaps: ExecutiveGapRow[] = kpi.rows.map((row) => {
    const targetMissing = row.target_value == null;
    return {
      id: row.metric.id,
      title: row.metric.title,
      actual_formatted: row.actual.formatted,
      target_formatted: formatTarget(row.target_value, row.metric.unit),
      target_missing: targetMissing,
      rag: targetMissing ? "unknown" : row.rag,
      delta_pct: row.delta_pct,
      href: "/?analytics=1",
    };
  });
  const summary = {
    green: gaps.filter((g) => g.rag === "green").length,
    amber: gaps.filter((g) => g.rag === "amber").length,
    red: gaps.filter((g) => g.rag === "red").length,
    unknown: gaps.filter((g) => g.rag === "unknown").length,
    target_missing: gaps.filter((g) => g.target_missing).length,
  };
  return { gaps, summary };
}

function collectWork(): ExecutiveHome["work"] {
  const operators = loadOperatorRegistry()?.operators ?? [];
  const byId = new Map(listHandoffs().map((h) => [h.id, h]));
  const board = buildOrchestrationBoardList({ view: "incomplete" });
  const buckets: ExecutiveHome["work"] = {
    employee: [],
    guest: [],
    ai: [],
    unassigned: [],
  };

  const seen = new Set<string>();
  for (const plan of board.plans) {
    for (const card of plan.cards) {
      if (card.closed || seen.has(card.id)) continue;
      seen.add(card.id);
      const handoff = byId.get(card.id);
      if (!handoff || isClosedWorkOrder(handoff)) continue;
      const kind = assigneeKind(handoff, operators);
      if (buckets[kind].length >= MAX_WORK_PER_KIND) continue;
      const item: ExecutiveWorkItem = {
        id: card.id,
        root_id: card.rootId,
        title: card.title || resolveWorkOrderTitle(handoff),
        status: card.status,
        assignee_kind: kind,
        assignee_label: assigneeLabel(handoff, operators),
        agent: handoff.to_agent,
        due_date: handoff.due_date,
        href: `/runs/?id=${encodeURIComponent(card.rootId)}`,
      };
      buckets[kind].push(item);
    }
  }
  return buckets;
}

export function buildExecutiveHome(): ExecutiveHome {
  const today = buildTodayContext();
  const attention = collectAttention(today);
  const kpi = buildKpiScorecardView({
    asOf: today.report_date,
    cache: createMetricResolverCache({ expensive: "cached" }),
  });
  const { gaps, summary } = collectGaps(kpi);
  const work = collectWork();
  const work_open_count =
    work.employee.length +
    work.guest.length +
    work.ai.length +
    work.unassigned.length;

  let variance: ExecutiveHome["variance"];
  try {
    const fy = kpi.fiscal_year || "FY2026";
    const report = computeVarianceReport(fy);
    variance = {
      fiscal_year: report.fiscalYear,
      plan_total: report.planTotal,
      actual_total: report.actualTotal,
      delta_total: report.deltaTotal,
      href: "/?wallet=1",
    };
  } catch {
    variance = undefined;
  }

  return executiveHomeSchema.parse({
    ok: true as const,
    tenant: today.tenant,
    report_date: today.report_date,
    company_name: today.company_name,
    attention,
    attention_count: attention.length,
    gaps,
    gap_summary: summary,
    work,
    work_open_count,
    finance_runway_months: today.finance_runway_months ?? null,
    finance_cash_balance: today.finance_cash_balance ?? null,
    agent_summaries: (today.agent_summary_paths ?? []).slice(0, 8).map((path) => ({
      path,
      label: agentSummaryLabel(path),
    })),
    variance,
  });
}
