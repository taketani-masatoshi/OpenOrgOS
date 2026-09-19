/**
 * Compose Executive Home for Operator Console `/`.
 * Path: src/lib/executive-home/build-home.ts
 * ADR: docs/adr/0065-executive-home-console.md
 * ADR: docs/adr/0073-executive-home-mal-lanes.md
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
import { loadOperatorRegistry } from "../org/operators.js";
import { isClosedWorkOrder } from "../orchestration/work-order-state.js";
import { assigneeKind, assigneeLabel } from "./assignee-kind.js";
import { buildTaskView } from "../tasks/task-view.js";
import { buildPropertyOpsDashboard } from "../property-ops/build-dashboard.js";
import { computeModuleReadiness } from "../module-readiness-score.js";
import { loadEnabledModulesSafe } from "../modules.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { getTenantId } from "../tenant.js";
import { currentDate } from "../utils.js";

const MAX_ATTENTION = 24;
const MAX_WORK_PER_KIND = 12;
/** Cap sales/CS noise so MAL ops stay visible on the morning home. */
const MAX_CUSTOMER_ATTENTION = 4;

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

  // --- MAL lanes first (secretary / tasks / property ops) ---
  try {
    const view = buildTaskView();
    for (const t of view.tasks.filter((x) => x.priority === "p0" || x.priority === "p1").slice(0, 8)) {
      items.push({
        id: `task:${t.id}`,
        kind: "task",
        title: t.title,
        status: `${t.priority}/${t.status}`,
        href: "/secretary/workbench/",
        severity: t.priority === "p0" ? "p0" : "p1",
      });
    }
    for (const c of view.candidates
      .filter((x) => x.priority === "p0" || x.priority === "p1")
      .slice(0, 4)) {
      items.push({
        id: `cand:${c.kind}:${c.id}`,
        kind: "task",
        title: c.title,
        status: `candidate/${c.kind}`,
        href: c.href,
        severity: c.priority === "p0" ? "p0" : "p1",
      });
    }
  } catch {
    /* tasks optional */
  }

  try {
    const props = buildPropertyOpsDashboard();
    for (const card of props.properties) {
      if (card.due_p0 <= 0) continue;
      items.push({
        id: `prop:${card.property_id}`,
        kind: "property",
        title: `${card.name}: P0 未対応 ${card.due_p0} 件`,
        status: `due_p0=${card.due_p0}`,
        href: card.href,
        severity: "p0",
      });
      for (const d of card.due.filter((x) => x.severity === "p0").slice(0, 3)) {
        items.push({
          id: `propdue:${card.property_id}:${d.id}`,
          kind: "property",
          title: `${card.name}: ${d.title}`,
          status: d.kind,
          href: d.href,
          severity: "p0",
        });
      }
    }
  } catch {
    /* property ops optional */
  }

  try {
    const pipeline = buildSalesPipelineView({ includeDemo: false });
    for (const a of pipeline.alerts.slice(0, 2)) {
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
    for (const a of inbound.alerts.slice(0, 1)) {
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
    for (const a of cs.renewal_alerts.slice(0, 1)) {
      items.push({
        id: `renewal:${a.account_id}`,
        kind: "customer",
        title: `${a.company}: 更新まで ${a.days_remaining} 日（${a.health}）`,
        status: "renewal",
        href: "/customers/after-sales/",
        severity: a.days_remaining <= 30 ? "p0" : "p1",
      });
    }
  } catch {
    /* optional */
  }

  try {
    const churn = buildCustomerChurnView({ includeDemo: false });
    for (const row of churn.accounts
      .filter((a) => a.reason === "at_risk" || a.reason === "critical" || a.reason === "dormant")
      .slice(0, 1)) {
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

  // Cap customer noise after MAL items
  const mal = items.filter((i) => i.kind !== "customer");
  const customer = items
    .filter((i) => i.kind === "customer")
    .slice(0, MAX_CUSTOMER_ATTENTION);
  items.length = 0;
  items.push(...mal, ...customer);

  for (const m of today.mail_intake_pending.slice(0, 5)) {
    items.push({
      id: `mail:${m.id}`,
      kind: "mail",
      title: m.subject,
      status: `${m.importance}/${m.urgency}`,
      href: "/secretary/workbench/",
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

  const severityRank = { p0: 0, p1: 1, p2: 2 } as const;
  const kindBoost = (kind: ExecutiveAttentionItem["kind"]): number => {
    if (kind === "task" || kind === "property" || kind === "mail" || kind === "approval") {
      return 0;
    }
    if (kind === "ceo_question" || kind === "wire" || kind === "scheduling") return 1;
    return 2;
  };
  items.sort((a, b) => {
    const pr =
      (severityRank[a.severity ?? "p2"] ?? 2) -
      (severityRank[b.severity ?? "p2"] ?? 2);
    if (pr !== 0) return pr;
    return kindBoost(a.kind) - kindBoost(b.kind);
  });
  return items.slice(0, MAX_ATTENTION);
}

function collectMalLanes(today: {
  mail_intake_action_required_count?: number;
  wire_pending?: Array<{ id: string }>;
}): ExecutiveHome["lanes"] {
  try {
    const view = buildTaskView();
    let props;
    try {
      props = buildPropertyOpsDashboard();
    } catch {
      props = null;
    }
    const propertyDueP0 =
      props?.properties.reduce((sum, p) => sum + p.due_p0, 0) ?? 0;
    let modulesUnset = 0;
    try {
      const tenantId = getTenantId();
      for (const mod of loadEnabledModulesSafe()) {
        if (!mod.enabled) continue;
        const ready = computeModuleReadiness(mod.id, { tenantId });
        if (ready.gaps.length > 0) modulesUnset += 1;
      }
    } catch {
      modulesUnset = 0;
    }
    return {
      secretary_href: "/secretary/workbench/",
      properties_href: "/properties/",
      wire_href: "/wire/",
      modules_href: "/modules/maturity/",
      tasks_p0: view.counts.p0,
      tasks_open: view.counts.open,
      mail_action_required: today.mail_intake_action_required_count ?? 0,
      approvals_pending: (() => {
        try {
          return listOrgApprovals({ status: "pending_approval" }).length;
        } catch {
          return 0;
        }
      })(),
      property_due_p0: propertyDueP0,
      wire_pending: today.wire_pending?.length ?? 0,
      modules_unset: modulesUnset,
      properties: (props?.properties ?? []).map((p) => ({
        property_id: p.property_id,
        name: p.name,
        due_p0: p.due_p0,
        href: p.href,
      })),
    };
  } catch {
    return {
      secretary_href: "/secretary/workbench/",
      properties_href: "/properties/",
      wire_href: "/wire/",
      modules_href: "/modules/maturity/",
      tasks_p0: 0,
      tasks_open: 0,
      mail_action_required: today.mail_intake_action_required_count ?? 0,
      approvals_pending: 0,
      property_due_p0: 0,
      wire_pending: today.wire_pending?.length ?? 0,
      modules_unset: 0,
      properties: [],
    };
  }
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
  const tenant = getTenantId();
  let today: ReturnType<typeof buildTodayContext> | null = null;
  try {
    today = buildTodayContext();
  } catch {
    today = null;
  }

  const todayOrEmpty = today ?? {
    tenant,
    report_date: currentDate(),
    company_name: tenant,
    decisions: [],
    approvals: [],
    wire_pending_count: 0,
    wire_pending: [],
    wire_delivery_pending_count: 0,
    wire_delivery: [],
    email_wire_pending_count: 0,
    email_wire_pending: [],
    witness_pending: [],
    witness_pending_count: 0,
    inbox_pending: [],
    mail_intake_pending_count: 0,
    mail_intake_action_required_count: 0,
    mail_intake_pending: [],
    sender_identification_pending_count: 0,
    sender_identification_pending: [],
    ceo_inline_questions_pending_count: 0,
    ceo_inline_questions_pending: [],
    scheduling_cases_active_count: 0,
    scheduling_cases_action_count: 0,
    scheduling_cases_pending: [],
    escalate_pending_count: 0,
    agent_coo_relay_count: 0,
    agent_coo_relay: [],
    agent_steward_inbox_count: 0,
    agent_steward_inbox: [],
    kpis: [],
    agent_summary_paths: [],
    finance_runway_months: null,
    finance_cash_balance: null,
  };

  const attention = collectAttention(todayOrEmpty as ReturnType<typeof buildTodayContext>);

  let gaps: ExecutiveGapRow[] = [];
  let summary: ExecutiveHome["gap_summary"] = {
    green: 0,
    amber: 0,
    red: 0,
    unknown: 0,
    target_missing: 0,
  };
  let variance: ExecutiveHome["variance"];
  try {
    const kpi = buildKpiScorecardView({
      asOf: todayOrEmpty.report_date,
      cache: createMetricResolverCache({ expensive: "cached" }),
    });
    ({ gaps, summary } = collectGaps(kpi));
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
  } catch {
    variance = undefined;
  }

  let work: ExecutiveHome["work"] = {
    employee: [],
    guest: [],
    ai: [],
    unassigned: [],
  };
  try {
    work = collectWork();
  } catch {
    /* optional */
  }
  const work_open_count =
    work.employee.length +
    work.guest.length +
    work.ai.length +
    work.unassigned.length;

  return executiveHomeSchema.parse({
    ok: true as const,
    tenant: todayOrEmpty.tenant,
    report_date: todayOrEmpty.report_date,
    company_name: todayOrEmpty.company_name,
    attention,
    attention_count: attention.length,
    lanes: collectMalLanes(todayOrEmpty),
    gaps,
    gap_summary: summary,
    work,
    work_open_count,
    finance_runway_months: todayOrEmpty.finance_runway_months ?? null,
    finance_cash_balance: todayOrEmpty.finance_cash_balance ?? null,
    agent_summaries: (todayOrEmpty.agent_summary_paths ?? [])
      .slice(0, 8)
      .map((path) => ({
        path,
        label: agentSummaryLabel(path),
      })),
    variance,
  });
}
