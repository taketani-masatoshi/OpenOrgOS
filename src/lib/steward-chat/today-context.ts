import { computeDashboard } from "../dashboard.js";
import { listCooRelayInbox, listStewardInbox } from "../agent-reporting.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { listPendingInbox } from "../document-io.js";
import { listWorkOrders } from "../escalate.js";
import { getTenantId, getWorkspaceRoot, loadTenantConfig } from "../tenant.js";
import { todayContextSchema, type TodayContext } from "../../../schemas/steward-chat.js";
import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { currentDate, getDocsDir } from "../utils.js";
import { getTenantMailMessages } from "../wire-console/human-mail.js";
import { isWireConsoleEnabled } from "../wire-console/tenant-registry.js";
import { listWirePending } from "../protocol/wire-queue.js";
import { findPeer, resolvePeerInboundEndpoints } from "../protocol/peers.js";
import { isEmailWireEndpoint } from "../../../schemas/protocol/peer-endpoint.js";
import {
  countHighPriorityTriage,
  listTriageEntries,
} from "../correspondence/mail-triage-queue.js";
import { listSenderIdentificationPending } from "../correspondence/sender-identification.js";
import {
  listPendingCeoInlineQuestions,
} from "../correspondence/ceo-inline-question.js";
import {
  isCorrespondenceApprovalSubject,
  loadCorrespondenceDraftForApproval,
} from "../correspondence/review.js";
import { getCashflowTodaySummary } from "../../../steward/jurisdiction-packs/JP/modules/jp_bank_corporate/cli/lib.js";
import {
  countActiveSchedulingCases,
  listSchedulingCases,
} from "../scheduling-coordination/store.js";
import { buildSchedulingTodayItem } from "../scheduling-coordination/today-summary.js";
import { findLatestAgentSummaries } from "../agent-summaries.js";
import { buildAgentRosterTodaySummary } from "../agent-roster.js";

function repoRelativePath(path: string): string {
  return relative(getWorkspaceRoot(), path).replace(/\\/g, "/");
}

function countWirePending(): number {
  try {
    const pending = listOrgApprovals({ scope: "wire", status: "pending_approval" });
    return pending.length;
  } catch {
    return 0;
  }
}

function loadWirePendingItems(tenant: string) {
  if (!isWireConsoleEnabled(tenant)) return [];
  try {
    return getTenantMailMessages(tenant, "pending")
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        subject: m.subject,
        counterparty: m.counterparty,
        preview: m.preview,
        status_label: m.status_label,
        can_approve: m.can_approve,
        approval_id:
          m.approval_id ??
          (m.id.startsWith("approval:") ? m.id.slice("approval:".length) : undefined),
      }));
  } catch {
    return [];
  }
}

function loadWireDeliveryItems() {
  try {
    return listWirePending()
      .slice(0, 8)
      .map((p) => ({
        peer_id: p.peer_id,
        event_id: p.event_id,
        attempts: p.attempts,
        last_error: p.last_error,
        created_at: p.created_at,
      }));
  } catch {
    return [];
  }
}

function countWireDeliveryPending(): number {
  try {
    return listWirePending().length;
  } catch {
    return 0;
  }
}

function loadEmailWirePendingItems() {
  try {
    return listWirePending()
      .filter((p) => {
        const peer = findPeer(p.peer_id);
        if (!peer) return false;
        return resolvePeerInboundEndpoints(peer).some((ep) => isEmailWireEndpoint(ep));
      })
      .slice(0, 8)
      .map((p) => ({
        peer_id: p.peer_id,
        event_id: p.event_id,
        attempts: p.attempts,
        last_error: p.last_error,
        created_at: p.created_at,
      }));
  } catch {
    return [];
  }
}

function countEmailWirePending(): number {
  try {
    return listWirePending().filter((p) => {
      const peer = findPeer(p.peer_id);
      if (!peer) return false;
      return resolvePeerInboundEndpoints(peer).some((ep) => isEmailWireEndpoint(ep));
    }).length;
  } catch {
    return 0;
  }
}

function loadWitnessPendingItems(tenant: string) {
  if (!isWireConsoleEnabled(tenant)) return [];
  try {
    return getTenantMailMessages(tenant, "witness")
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        subject: m.subject,
        preview: m.preview,
        event_id: m.event_id ?? m.wire_event_id,
        wire_event_id: m.wire_event_id ?? m.event_id,
        can_witness: m.can_witness,
      }));
  } catch {
    return [];
  }
}

export function buildTodayContext(): TodayContext {
  const report = computeDashboard();
  const tenant = getTenantId();
  const company = loadTenantConfig();

  const p0Tasks = report.highUrgencyTasks
    .filter((t) => t.importance === "high")
    .slice(0, 3);

  const decisions = p0Tasks.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    due_date: t.dueDate,
    importance: t.importance,
  }));

  const approvals = listOrgApprovals({ status: "pending_approval" })
    .filter((approval) => {
      if (!isCorrespondenceApprovalSubject(approval.subject_type)) return true;
      return loadCorrespondenceDraftForApproval(approval)?.notes?.includes("scheduling-case:") === true;
    })
    .map((a) => ({
      id: a.approval_id,
      scope: a.scope,
      subject: a.subject_ref ?? a.approval_id,
      status: a.status,
      proposed_at: a.proposed_at,
    }));

  const inbox = listPendingInbox().slice(0, 10).map((i) => ({
    id: i.id,
    title: i.title,
  }));

  const escalatePending = listWorkOrders("pending").length;
  const cooRelay = listCooRelayInbox();
  const stewardInbox = listStewardInbox();

  const kpis = report.kpis.slice(0, 6).map((k) => ({
    label: k.label,
    value: k.value,
  }));

  const dashboardPath = join(getDocsDir(), "reports", "dashboard", `${currentDate()}.md`);
  const executivePath = join(getDocsDir(), "reports", "executive-notes", `${currentDate()}-dashboard-sync.md`);

  let cashflowMeta: ReturnType<typeof getCashflowTodaySummary> = {};
  try {
    cashflowMeta = getCashflowTodaySummary();
  } catch {
    // JP cashflow module optional per tenant data
  }
  const latestAgentSummaries = findLatestAgentSummaries();
  const agentSummaryPaths = latestAgentSummaries
    ? [
        latestAgentSummaries.finance,
        latestAgentSummaries.contract,
        latestAgentSummaries.compliance,
        latestAgentSummaries.operations,
        latestAgentSummaries.executive,
        ...(latestAgentSummaries.modules ?? []).map((entry) => entry.path),
      ]
        .filter((path): path is string => Boolean(path))
        .map(repoRelativePath)
    : [];

  const wirePending = loadWirePendingItems(tenant);
  const wireDelivery = loadWireDeliveryItems();
  const emailWirePending = loadEmailWirePendingItems();
  const witnessPending = loadWitnessPendingItems(tenant);
  const mailCounts = countHighPriorityTriage();
  const mailIntakePending = listTriageEntries({
    handoffStatus: "pending",
    limit: 8,
  })
    .filter((e) => e.disposition !== "spam")
    .map((e) => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      importance: e.importance,
      urgency: e.urgency,
      handoff_status: e.handoff_status,
    }));

  const senderIdAll = listSenderIdentificationPending();
  const senderIdPending = senderIdAll.slice(0, 8).map((s) => {
    const triage = listTriageEntries({ limit: 200 }).find((e) => e.id === s.mail_id);
    return {
      mail_id: s.mail_id,
      sender_email: s.sender_email,
      sender_display_name: s.sender_display_name,
      subject: triage?.subject,
    };
  });

  const ceoInlineAll = listPendingCeoInlineQuestions();
  const ceoInlinePending = ceoInlineAll.slice(0, 8).map((q) => ({
    id: q.id,
    mail_id: q.mail_id,
    subject: q.subject,
    context_preview: q.context_l1.slice(0, 200),
    field_count: q.fields.length,
  }));

  const schedulingActive = listSchedulingCases({ activeOnly: true, limit: 20 });
  const schedulingNeeding = schedulingActive.filter((c) => c.next_action !== "none");
  const schedulingPending = schedulingNeeding
    .map((c) => ({ caseRow: c, item: buildSchedulingTodayItem(c) }))
    .filter(({ item }) => item.visible_to_ceo)
    .slice(0, 8)
    .map(({ caseRow: c, item }) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      next_action: c.next_action,
      headline: item.headline,
      detail: item.detail,
      approval_id: item.approval_id,
      ceo_question_id: item.ceo_question_id,
      action_path: item.approval_id
        ? `/chat/v1/approvals/${encodeURIComponent(item.approval_id)}/approve`
        : item.ceo_question_id
          ? `/chat/v1/ceo-questions/${encodeURIComponent(item.ceo_question_id)}/answer`
          : undefined,
      preview_path: item.approval_id
        ? `/chat/v1/approvals/${encodeURIComponent(item.approval_id)}/scheduling-preview`
        : undefined,
      action_kind: item.approval_id ? "approve" as const : "answer" as const,
      pending_participants: c.participants.filter((p) => p.response === "pending").length,
    }));

  const roster = buildAgentRosterTodaySummary();

  const ctx = todayContextSchema.parse({
    tenant,
    report_date: report.reportDate,
    company_name: report.companyName ?? company.display_name ?? tenant,
    decisions,
    approvals,
    wire_pending_count: countWirePending(),
    wire_pending: wirePending,
    wire_delivery_pending_count: countWireDeliveryPending(),
    wire_delivery: wireDelivery,
    email_wire_pending_count: countEmailWirePending(),
    email_wire_pending: emailWirePending,
    witness_pending: witnessPending,
    witness_pending_count: witnessPending.length,
    inbox_pending: inbox,
    mail_intake_pending_count: mailCounts.pending,
    mail_intake_action_required_count: mailCounts.actionRequired,
    mail_intake_pending: mailIntakePending,
    sender_identification_pending_count: senderIdAll.length,
    sender_identification_pending: senderIdPending,
    ceo_inline_questions_pending_count: ceoInlineAll.length,
    ceo_inline_questions_pending: ceoInlinePending,
    scheduling_cases_active_count: countActiveSchedulingCases(),
    scheduling_cases_action_count: schedulingPending.length,
    scheduling_cases_pending: schedulingPending,
    escalate_pending_count: escalatePending,
    agent_coo_relay_count: cooRelay.length,
    agent_coo_relay: cooRelay.slice(0, 8).map((m) => ({
      id: m.id,
      field_agent: m.field_agent,
      subject: m.subject,
      type: m.type,
      has_report: Boolean(m.report),
    })),
    agent_steward_inbox_count: stewardInbox.length,
    agent_steward_inbox: stewardInbox.slice(0, 8).map((m) => ({
      id: m.id,
      field_agent: m.field_agent,
      subject: m.subject,
      type: m.type,
      has_report: true,
    })),
    kpis,
    executive_summary_path: existsSync(executivePath) ? executivePath : undefined,
    dashboard_path: existsSync(dashboardPath) ? dashboardPath : undefined,
    agent_summary_paths: agentSummaryPaths,
    cashflow_schedule_path: cashflowMeta.schedule_path,
    cashflow_shortfall_date: cashflowMeta.shortfall_date,
    cashflow_runway_days: cashflowMeta.runway_days,
    cashflow_required_funding_amount: cashflowMeta.required_funding_amount,
    cashflow_required_funding_by_date: cashflowMeta.required_funding_by_date,
    agent_roster_configured: roster.configured,
    agent_roster_operational_count: roster.operational_count,
    agent_roster_developer_count: roster.developer_count,
    agent_roster_operational: roster.operational,
    agent_roster_developer: roster.developer,
  });

  return ctx;
}

export function formatTodayContextMarkdown(ctx: TodayContext): string {
  const actionableWire = ctx.wire_pending.filter(
    (item) => item.can_approve && item.approval_id
  );
  const approvalIds = new Set([
    ...ctx.approvals.map((item) => item.id),
    ...actionableWire.map((item) => item.approval_id!),
    ...ctx.scheduling_cases_pending
      .map((item) => item.approval_id)
      .filter((id): id is string => Boolean(id)),
  ]);
  const questionIds = new Set([
    ...ctx.ceo_inline_questions_pending.map((item) => item.id),
    ...ctx.scheduling_cases_pending
      .map((item) => item.ceo_question_id)
      .filter((id): id is string => Boolean(id)),
  ]);
  const schedulingQuestionIds = new Set(
    ctx.scheduling_cases_pending
      .map((item) => item.ceo_question_id)
      .filter((id): id is string => Boolean(id))
  );
  const otherQuestions = ctx.ceo_inline_questions_pending.filter(
    (item) => !schedulingQuestionIds.has(item.id)
  );
  const decisionCount = ctx.decisions.length + questionIds.size;
  const approvalCount = approvalIds.size;
  const retryCount = ctx.wire_delivery_pending_count > 0 ? 1 : 0;
  const lines = [
    `# Today — ${ctx.company_name}`,
    `**結論:** 判断 ${decisionCount} 件 · 承認 ${approvalCount} 件 · 再試行 ${retryCount} 件`,
    `**次の操作:** ${decisionCount + approvalCount + retryCount === 0 ? "ありません" : "以下の Chat 操作だけ実行できます"}`,
    "",
    "## Agent roster",
    `- configured: ${ctx.agent_roster_configured ? "yes" : "compatibility default"}`,
    `- operational (${ctx.agent_roster_operational_count}): ${
      ctx.agent_roster_operational.length
        ? ctx.agent_roster_operational.map((a) => a.id).join(", ")
        : "—"
    }`,
  ];
  if (ctx.agent_roster_developer_count > 0) {
    lines.push(
      `- developer (${ctx.agent_roster_developer_count}): ${ctx.agent_roster_developer.map((a) => a.id).join(", ")}`
    );
  }
  lines.push(`- detail: agent roster show`);

  if (ctx.decisions.length > 0) {
    lines.push("", "## 判断", "");
    for (const decision of ctx.decisions) {
      lines.push(
        `- **${decision.title}**${decision.due_date ? `（期限 ${decision.due_date}）` : ""}`,
        `  参照: ${decision.id}`
      );
    }
  }

  if (otherQuestions.length > 0) {
    lines.push("", "## CEO回答", "");
    for (const question of otherQuestions) {
      lines.push(
        `- **${question.subject}**`,
        `  回答: POST /chat/v1/ceo-questions/${encodeURIComponent(question.id)}/answer`
      );
    }
  }

  if (ctx.scheduling_cases_pending.length > 0) {
    lines.push("", "## 日程調整", "");
    for (const item of ctx.scheduling_cases_pending) {
      lines.push(`- **${item.headline}**`, `  ${item.detail}`);
    }
  }

  const schedulingApprovalIds = new Set(
    ctx.scheduling_cases_pending
      .map((item) => item.approval_id)
      .filter((id): id is string => Boolean(id))
  );
  const otherApprovals = ctx.approvals.filter(
    (approval) => !schedulingApprovalIds.has(approval.id)
  );
  if (otherApprovals.length > 0 || actionableWire.length > 0) {
    lines.push("", "## その他の承認", "");
    for (const approval of otherApprovals) {
      lines.push(
        `- **${approval.subject}**`,
        `  承認: POST /chat/v1/approvals/${encodeURIComponent(approval.id)}/approve`
      );
    }
    for (const wire of actionableWire) {
      lines.push(
        `- **${wire.subject}** — ${wire.counterparty}`,
        `  承認: POST /chat/v1/approvals/${encodeURIComponent(wire.approval_id!)}/approve`
      );
    }
  }

  if (ctx.wire_delivery_pending_count > 0) {
    lines.push(
      "",
      "## 再試行",
      "",
      `- **Wire 配送 ${ctx.wire_delivery_pending_count} 件を再試行**`,
      "  実行: POST /chat/v1/wire/flush"
    );
  }

  if (ctx.cashflow_schedule_path) {
    lines.push("", "## 資金繰り", "");
    if ((ctx.cashflow_required_funding_amount ?? 0) > 0) {
      lines.push(
        `- 必要調達額: ${ctx.cashflow_required_funding_amount?.toLocaleString("ja-JP")}円` +
          (ctx.cashflow_required_funding_by_date
            ? `（${ctx.cashflow_required_funding_by_date}まで）`
            : "")
      );
    } else {
      lines.push("- 必要調達額: 0円");
    }
    lines.push(`  参照: ${ctx.cashflow_schedule_path}`);
  }

  return `${lines.join("\n")}\n`;
}

export function buildTodaySummaryForPush(ctx: TodayContext): string {
  const decisionLines =
    ctx.decisions.length > 0
      ? ctx.decisions.map((d, i) => `${i + 1}. ${d.title}`).join("; ")
      : "P0 なし";
  return `${ctx.company_name} · ${ctx.report_date}: 判断=${decisionLines}; 承認待ち=${ctx.approvals.length}; inbox=${ctx.inbox_pending.length}; mail_intake=${ctx.mail_intake_pending_count}`;
}
