import { computeDashboard } from "../dashboard.js";
import { listCooRelayInbox, listStewardInbox } from "../agent-reporting.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { listPendingInbox } from "../document-io.js";
import { listWorkOrders } from "../escalate.js";
import { getTenantId, loadTenantConfig } from "../tenant.js";
import { todayContextSchema, type TodayContext } from "../../../schemas/steward-chat.js";
import { join } from "node:path";
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
  formatCeoInlineForToday,
} from "../correspondence/ceo-inline-question.js";

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

  const approvals = listOrgApprovals({ status: "pending_approval" }).map((a) => ({
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
  });

  return ctx;
}

export function formatTodayContextMarkdown(ctx: TodayContext): string {
  const lines = [
    `# Today — ${ctx.company_name}`,
    "",
    `**Date:** ${ctx.report_date} · **Tenant:** ${ctx.tenant}`,
    "",
    "## 今日の判断（最大 3 件）",
    "",
  ];

  if (ctx.decisions.length === 0) {
    lines.push("1. P0 タスクなし — 計画通り");
  } else {
    ctx.decisions.forEach((d, i) => {
      lines.push(`${i + 1}. **${d.id}** ${d.title}${d.due_date ? `（期限 ${d.due_date}）` : ""}`);
    });
  }

  lines.push("", "## 承認待ち", "");
  if (ctx.approvals.length === 0) {
    lines.push("（なし）");
  } else {
    for (const a of ctx.approvals) {
      lines.push(`- **${a.id}** [${a.scope}] ${a.subject}`);
    }
  }

  lines.push("", "## Mail Intake（受信メール）", "");
  if (ctx.mail_intake_pending.length === 0) {
    lines.push(
      `未処理 ${ctx.mail_intake_pending_count} 件 · 要対応 ${ctx.mail_intake_action_required_count} 件`
    );
  } else {
    lines.push(
      `未処理 ${ctx.mail_intake_pending_count} 件 · 要対応 ${ctx.mail_intake_action_required_count} 件`,
      ""
    );
    for (const m of ctx.mail_intake_pending) {
      lines.push(
        `- [${m.importance}/${m.urgency}] **${m.subject}** ← ${m.from} · ${m.handoff_status}`
      );
    }
  }

  lines.push("", "## CEO インライン質問（要回答）", "");
  if (ctx.ceo_inline_questions_pending.length === 0) {
    lines.push("（なし）");
  } else {
    for (const q of ctx.ceo_inline_questions_pending) {
      const full = listPendingCeoInlineQuestions().find((x) => x.id === q.id);
      if (full) {
        lines.push(formatCeoInlineForToday(full));
      } else {
        lines.push(`- **${q.subject}** (${q.id}) · ${q.mail_id} · 質問 ${q.field_count} 件`);
      }
      lines.push("");
    }
  }

  lines.push("", "## 未知送信者（CEO 確認待ち）", "");
  if (ctx.sender_identification_pending.length === 0) {
    lines.push("（なし）");
  } else {
    for (const s of ctx.sender_identification_pending) {
      lines.push(
        `- **${s.mail_id}** ${s.sender_display_name ?? s.sender_email} · ${s.subject ?? "—"}`
      );
    }
  }

  lines.push(
    "",
    "## Wire 送信待ち",
    ""
  );
  if (ctx.wire_pending.length === 0) {
    lines.push(`（件数 ${ctx.wire_pending_count} — 詳細なし）`);
  } else {
    for (const w of ctx.wire_pending) {
      lines.push(
        `- **${w.subject}** — ${w.counterparty} · ${w.status_label}${w.can_approve ? " · 承認可" : ""}`
      );
      if (w.preview) lines.push(`  ${w.preview}`);
    }
  }

  lines.push(
    "",
    "## Wire 配送待ち",
    ""
  );
  if (ctx.wire_delivery.length === 0) {
    lines.push(`（${ctx.wire_delivery_pending_count} 件 — 詳細なし）`);
  } else {
    for (const d of ctx.wire_delivery) {
      lines.push(
        `- **${d.peer_id}** · ${d.event_id.slice(0, 8)}… · attempts ${d.attempts}${d.last_error ? ` · ${d.last_error}` : ""}`
      );
    }
  }

  lines.push("", "## Email Wire 配送待ち", "");
  if (ctx.email_wire_pending.length === 0) {
    lines.push(`（${ctx.email_wire_pending_count} 件 — 詳細なし）`);
  } else {
    for (const d of ctx.email_wire_pending) {
      lines.push(
        `- **${d.peer_id}** · ${d.event_id.slice(0, 8)}… · attempts ${d.attempts}${d.last_error ? ` · ${d.last_error}` : ""}`
      );
    }
  }

  lines.push(
    "",
    "## Email-Wire 配送待ち",
    ""
  );
  if (ctx.email_wire_pending.length === 0) {
    lines.push(`（${ctx.email_wire_pending_count} 件 — 詳細なし）`);
  } else {
    for (const d of ctx.email_wire_pending) {
      lines.push(
        `- **${d.peer_id}** · ${d.event_id.slice(0, 8)}… · attempts ${d.attempts}${d.last_error ? ` · ${d.last_error}` : ""}`
      );
    }
    lines.push("", "`orgos protocol deliver status --event-id <uuid>`");
  }

  lines.push(
    "",
    "## Witness 確認待ち",
    ""
  );
  if (ctx.witness_pending.length === 0) {
    lines.push("（なし）");
  } else {
    for (const w of ctx.witness_pending) {
      lines.push(`- **${w.subject}**${w.event_id ? ` · ${w.event_id.slice(0, 8)}…` : ""}`);
      if (w.preview) lines.push(`  ${w.preview}`);
    }
  }

  lines.push(
    "",
    "## Agent 報告チェーン",
    "",
    `- COO 中継待ち: ${ctx.agent_coo_relay_count} 件`,
    `- Steward inbox: ${ctx.agent_steward_inbox_count} 件`,
    ""
  );

  if (ctx.agent_steward_inbox.length > 0) {
    lines.push("### Steward inbox（抜粋）", "");
    for (const m of ctx.agent_steward_inbox) {
      lines.push(`- **${m.id}** · ${m.field_agent} · ${m.subject}`);
    }
    lines.push("");
  }

  lines.push(
    "",
    "## その他",
    "",
    `- Wire 送信待ち: ${ctx.wire_pending_count} 件`,
    `- Wire 配送待ち: ${ctx.wire_delivery_pending_count} 件`,
    `- Email Wire 配送待ち: ${ctx.email_wire_pending_count} 件`,
    `- Witness 確認待ち: ${ctx.witness_pending_count} 件`,
    `- inbox 未処理: ${ctx.inbox_pending.length} 件`,
    `- Mail Intake 未処理: ${ctx.mail_intake_pending_count} 件 · 要対応: ${ctx.mail_intake_action_required_count} 件`,
    `- CEO インライン質問: ${ctx.ceo_inline_questions_pending_count} 件`,
    `- escalate pending: ${ctx.escalate_pending_count} 件`,
    `- COO relay: ${ctx.agent_coo_relay_count} 件 · Steward inbox: ${ctx.agent_steward_inbox_count} 件`,
    "",
    "## KPI",
    ""
  );

  for (const k of ctx.kpis) {
    lines.push(`- ${k.label}: ${k.value}`);
  }

  return lines.join("\n");
}

export function buildTodaySummaryForPush(ctx: TodayContext): string {
  const decisionLines =
    ctx.decisions.length > 0
      ? ctx.decisions.map((d, i) => `${i + 1}. ${d.title}`).join("; ")
      : "P0 なし";
  return `${ctx.company_name} · ${ctx.report_date}: 判断=${decisionLines}; 承認待ち=${ctx.approvals.length}; inbox=${ctx.inbox_pending.length}; mail_intake=${ctx.mail_intake_pending_count}`;
}
