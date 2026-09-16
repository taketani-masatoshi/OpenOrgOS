/**
 * Compose Secretary Workbench for Operator Console `/secretary/workbench/`.
 * Path: src/lib/secretary-workbench/build-workbench.ts
 * ADR: docs/adr/0071-executive-tasks-ssot-secretary-workbench.md
 */
import {
  secretaryWorkbenchSchema,
  type SecretaryApprovalRow,
  type SecretaryDraftRow,
  type SecretaryMailRow,
  type SecretaryTaskRow,
  type SecretaryWorkbench,
} from "../../../schemas/secretary-workbench.js";
import type { TodayContext } from "../../../schemas/steward-chat.js";
import { listCorrespondenceDrafts } from "../correspondence/draft.js";
import { listTriageEntries } from "../correspondence/mail-triage-queue.js";
import { assessMailSetupReadiness } from "../correspondence/mail-setup-readiness.js";
import { listOrgApprovals } from "../org/approval/reject.js";
import { buildTodayContext } from "../steward-chat/today-context.js";
import { buildTaskView } from "../tasks/task-view.js";
import { getTenantId } from "../tenant.js";
import { currentDate } from "../utils.js";

const MAX_MAIL = 12;
const MAX_DRAFTS = 12;
const MAX_TASKS = 24;
const MAX_APPROVALS = 12;
const SECRETARY_MAIL_HREF = "/secretary/workbench/";
const MAIL_SETUP_HREF = "/?integrations=1";

function fromLabel(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  if (angle) {
    const name = from.slice(0, from.indexOf("<")).trim();
    return name || angle[1]!;
  }
  return from.split("@")[0] || from;
}

function toLabel(to: string | undefined): string {
  if (!to) return "(no recipient)";
  const first = to.split(",")[0]?.trim();
  if (!first) return "(no recipient)";
  return fromLabel(first);
}

export function buildSecretaryWorkbench(): SecretaryWorkbench {
  let today: TodayContext | null = null;
  try {
    today = buildTodayContext();
  } catch {
    today = null;
  }
  const view = buildTaskView();

  const mail: SecretaryMailRow[] = [];
  try {
    for (const entry of listTriageEntries({ unprocessed: true, limit: MAX_MAIL })) {
      if (entry.disposition === "spam") continue;
      const severity =
        entry.importance === "p0"
          ? "p0"
          : entry.importance === "p1" ||
              entry.urgency === "immediate" ||
              entry.urgency === "today"
            ? "p1"
            : "p2";
      mail.push({
        id: entry.id,
        subject: entry.subject || "(no subject)",
        from_label: fromLabel(entry.from),
        importance: entry.importance,
        urgency: entry.urgency,
        href: `${SECRETARY_MAIL_HREF}?mail=${encodeURIComponent(entry.id)}`,
        severity,
      });
    }
  } catch {
    /* optional */
  }

  const drafts: SecretaryDraftRow[] = [];
  try {
    const pending = listCorrespondenceDrafts().filter(
      (d) => d.status === "draft" || d.status === "pending_approval",
    );
    for (const d of pending.slice(0, MAX_DRAFTS)) {
      drafts.push({
        id: d.draft_id,
        subject: d.subject || d.draft_id,
        to_label: toLabel(d.to),
        status: d.status,
        created_at: d.created_at,
        href:
          d.status === "pending_approval"
            ? `/approvals/`
            : `${SECRETARY_MAIL_HREF}?draft=${encodeURIComponent(d.draft_id)}`,
      });
    }
  } catch {
    /* optional */
  }

  const tasks: SecretaryTaskRow[] = [];
  for (const t of view.tasks.slice(0, MAX_TASKS)) {
    const severity =
      t.priority === "p0" ? "p0" : t.priority === "p1" ? "p1" : "p2";
    tasks.push({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      due: t.due ?? null,
      next_action: t.next_action,
      property_id: t.property_id,
      module_id: t.module_id,
      asana_task_gid: t.links?.asana_task_gid,
      href: `/secretary/workbench/?task=${encodeURIComponent(t.id)}`,
      severity,
      candidate: false,
    });
  }
  for (const c of view.candidates.slice(0, Math.max(0, MAX_TASKS - tasks.length))) {
    tasks.push({
      id: c.id,
      title: c.title,
      priority: c.priority,
      status: c.status,
      due: c.due ?? null,
      href: c.href,
      severity: c.priority === "p0" ? "p0" : c.priority === "p1" ? "p1" : "p2",
      candidate: true,
      candidate_kind: c.kind,
    });
  }

  const approvals: SecretaryApprovalRow[] = [];
  try {
    for (const a of listOrgApprovals({ status: "pending_approval" }).slice(
      0,
      MAX_APPROVALS,
    )) {
      if (!a.approval_id) continue;
      approvals.push({
        id: a.approval_id,
        title: a.message || a.subject_type || a.approval_id,
        status: a.status,
        href: `/approvals/?id=${encodeURIComponent(a.approval_id)}`,
        severity: "p0",
      });
    }
  } catch {
    /* optional */
  }

  let mail_setup: SecretaryWorkbench["mail_setup"];
  try {
    const readiness = assessMailSetupReadiness("email");
    mail_setup = {
      ready: readiness.ready,
      issues: readiness.issues
        .filter((i) => i.severity === "error")
        .slice(0, 4)
        .map((i) => ({
          id: i.id,
          severity: i.severity,
          message: i.message,
          fix: i.fix,
        })),
      href: MAIL_SETUP_HREF,
    };
  } catch {
    mail_setup = undefined;
  }

  return secretaryWorkbenchSchema.parse({
    ok: true,
    tenant: getTenantId(),
    report_date: today?.report_date || currentDate(),
    company_name: today?.company_name || getTenantId(),
    mail,
    drafts,
    tasks,
    approvals,
    company: {
      cash_balance: today?.finance_cash_balance ?? null,
      runway_months: today?.finance_runway_months ?? null,
      mail_pending: today?.mail_intake_pending_count ?? mail.length,
      mail_action_required: today?.mail_intake_action_required_count ?? 0,
      approvals_pending: approvals.length,
      tasks_open: view.counts.open,
      tasks_p0: view.counts.p0,
      candidates: view.counts.candidates,
    },
    mail_setup,
  });
}
