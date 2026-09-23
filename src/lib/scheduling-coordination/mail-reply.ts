import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { dismissPendingSchedulingQuestions } from "../correspondence/ceo-inline-question.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { writeInboundHandoffDraft } from "../correspondence/mail-handoff.js";
import { loadSchedulingJudgmentContext } from "./judgment-context.js";
import { planScheduleReply } from "./reply-plan.js";
import { proposeExecutiveSlots } from "./slots.js";
import {
  findSchedulingCase,
  nextSlotId,
  updateSchedulingCase,
} from "./store.js";
import { ensureSchedulingCorrespondenceDrafts } from "./correspondence-drafts.js";
import { maybeAutoSendAuthorizedProposals } from "./delegated-send.js";

export interface ProcessScheduleMailResult {
  mail_id: string;
  case_id?: string;
  action: "linked" | "updated" | "skipped" | "unlinked";
  reason?: string;
}

/**
 * Apply an already-matched schedule reply onto a case: plan → persist →
 * optional counter follow-up drafts. Matching/intake lives in process-mail.
 */
export async function applyScheduleReplyToCase(opts: {
  entry: MailTriageEntry;
  caseRow: SchedulingCase;
  body: string;
  now?: Date;
}): Promise<ProcessScheduleMailResult> {
  const { entry } = opts;
  const now = opts.now ?? new Date();
  let caseRow = opts.caseRow;

  const plan = planScheduleReply({
    caseRow,
    mailId: entry.id,
    from: entry.from,
    body: opts.body,
    now,
    nextSlotId,
    proposeSlots: proposeExecutiveSlots,
    ctx: loadSchedulingJudgmentContext(caseRow),
  });

  caseRow = updateSchedulingCase(caseRow.id, caseRow.revision, () => plan.nextRow);
  if (plan.followUp === "counter_proposal_drafts") {
    dismissPendingSchedulingQuestions(caseRow.id);
    const refreshed = findSchedulingCase(caseRow.id);
    if (refreshed?.next_action === "send_proposal") {
      ensureSchedulingCorrespondenceDrafts(refreshed.id, "proposal");
      caseRow = (await maybeAutoSendAuthorizedProposals(refreshed.id)) ?? refreshed;
    }
  }

  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseRow.id,
    schedule_reply_parsed: plan.recognized,
    mail_thread_ids: [...new Set([...(entry.mail_thread_ids ?? []), ...caseRow.mail_thread_ids])],
  });

  try {
    writeInboundHandoffDraft(findTriageEntry(entry.id)!);
  } catch {
    // handoff optional
  }

  return {
    mail_id: entry.id,
    case_id: caseRow.id,
    action: plan.recognized ? "updated" : "linked",
    reason: plan.recognized
      ? `response=${plan.parsed.response}`
      : `needs_review:${caseRow.exception_reason}`,
  };
}
