import { runValidateReport } from "../../commands/validate.js";
import { findTriageEntry } from "../correspondence/mail-triage-queue.js";
import { findSchedulingCase } from "./store.js";
import type { SchedulingLifecycleStage } from "./lifecycle.js";

export interface RehearsalAssertionCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface RehearsalAssertionReport {
  ok: boolean;
  checks: RehearsalAssertionCheck[];
}

function push(checks: RehearsalAssertionCheck[], id: string, ok: boolean, detail: string): void {
  checks.push({ id, ok, detail });
}

export function assertSchedulingRehearsalComplete(opts: {
  caseId: string;
  processedMailIds?: string[];
  lifecycleStages?: SchedulingLifecycleStage[];
  runValidate?: boolean;
}): RehearsalAssertionReport {
  const checks: RehearsalAssertionCheck[] = [];
  const caseRow = findSchedulingCase(opts.caseId);
  if (!caseRow) {
    push(checks, "case_exists", false, `${opts.caseId} not found`);
    return { ok: false, checks };
  }
  push(checks, "case_exists", true, opts.caseId);

  const closed = caseRow.status === "closed";
  push(checks, "status_closed", closed, `status=${caseRow.status}`);

  const stages = new Set(caseRow.lifecycle_events.map((e) => e.stage));
  for (const required of opts.lifecycleStages ?? ["created", "proposal_sent", "confirmed"]) {
    const ok = stages.has(required);
    push(checks, `lifecycle_${required}`, ok, ok ? "present" : "missing");
  }

  const proposals = caseRow.correspondence.filter((r) => r.kind === "proposal");
  const proposalsSent = proposals.every((r) => Boolean(r.sent_at));
  push(
    checks,
    "proposals_sent",
    proposals.length === 0 || proposalsSent,
    `${proposals.filter((r) => r.sent_at).length}/${proposals.length} proposal drafts sent`
  );

  const confirms = caseRow.correspondence.filter((r) => r.kind === "confirm");
  const confirmsSent = confirms.every((r) => Boolean(r.sent_at));
  push(
    checks,
    "confirms_sent",
    confirms.length === 0 || confirmsSent,
    `${confirms.filter((r) => r.sent_at).length}/${confirms.length} confirm drafts sent`
  );

  const allAccepted = caseRow.participants.every((p) => p.response === "accept");
  push(
    checks,
    "participants_accept",
    allAccepted,
    caseRow.participants.map((p) => `${p.email}:${p.response}`).join(", ")
  );

  if (opts.processedMailIds?.length) {
    for (const mailId of opts.processedMailIds) {
      const triage = findTriageEntry(mailId);
      const parsed = Boolean(triage?.schedule_reply_parsed);
      push(
        checks,
        `mail_parsed_${mailId}`,
        parsed,
        parsed ? "schedule_reply_parsed" : "not parsed"
      );
      const processed = caseRow.processed_mail_ids.includes(mailId);
      push(
        checks,
        `mail_processed_${mailId}`,
        processed,
        processed ? "in processed_mail_ids" : "missing"
      );
    }
  }

  if (opts.runValidate) {
    const report = runValidateReport({ warnings: true });
    push(checks, "validate", report.ok, report.ok ? "ok" : `${report.error_count} error(s)`);
  }

  return { ok: checks.every((c) => c.ok), checks };
}
