import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import { dismissPendingSchedulingQuestions } from "../correspondence/ceo-inline-question.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { getMailReceivedDir } from "../correspondence/paths.js";
import { writeInboundHandoffDraft } from "../correspondence/mail-handoff.js";
import { applyNextAction } from "./next-action.js";
import { extractEmailAddress } from "./reply-parse.js";
import { interpretScheduleReply } from "./reply-interpret.js";
import { proposeExecutiveSlots } from "./slots.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import {
  findSchedulingCase,
  nextSlotId,
  updateSchedulingCase,
} from "./store.js";
import {
  findCaseForMailEntry,
  hasAmbiguousCaseMatch,
  isScheduleIntent,
  matchingCaseIds,
} from "./mail-match.js";
import {
  askUnlinkedScheduleChoice,
  createSafeScheduleIntake,
  linkMailToCase,
} from "./mail-intake.js";

import type { ProcessScheduleMailResult } from "./process-mail-types.js";

export type { ProcessScheduleMailResult } from "./process-mail-types.js";
export { findCaseForMailEntry } from "./mail-match.js";
export { linkMailToCase } from "./mail-intake.js";

async function readMailBody(entry: MailTriageEntry): Promise<string> {
  const filename = entry.eml_ref.split("/").pop();
  if (!filename) return "";
  const emlPath = join(getMailReceivedDir(), filename);
  try {
    const raw = readFileSync(emlPath, "utf-8");
    const parsed = await simpleParser(raw);
    return parsed.text ?? entry.subject;
  } catch {
    return entry.subject;
  }
}

function addMinutes(start: string, minutes: number): string {
  const value = new Date(`${start}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes()
  ).padStart(2, "0")}`;
  return `${date}T${time}`;
}

function findParticipantByEmail(
  caseRow: SchedulingCase,
  email: string
): SchedulingParticipant | undefined {
  const lower = email.toLowerCase();
  return caseRow.participants.find((p) => p.email?.toLowerCase() === lower);
}

export async function applyScheduleIntakeAnswer(
  question: CeoInlineQuestion
): Promise<SchedulingCase | undefined> {
  const choice = question.answers?.schedule_intake_choice?.trim();
  if (!choice) return undefined;
  const caseMatch = question.mail_id.match(
    /^schedule-intake-case:(SCH-\d{4}-\d{3}):(.+)$/
  );
  if (caseMatch) {
    const caseRow = findSchedulingCase(caseMatch[1]!);
    if (!caseRow) return undefined;
    const cancel = choice === "中止" || choice.toLowerCase() === "cancel";
    const updated = updateSchedulingCase(caseRow.id, caseRow.revision, (row) =>
      applyNextAction({
        ...row,
        status: cancel ? "cancelled" : "open",
        exception_reason: undefined,
        updated_at: new Date().toISOString(),
      })
    );
    if (cancel) recordSchedulingLifecycleEvent(updated.id, "cancelled", question.answered_by);
    return findSchedulingCase(updated.id) ?? updated;
  }

  const mailId = question.mail_id.match(/^schedule-intake:(.+)$/)?.[1];
  if (!mailId) return undefined;
  const entry = findTriageEntry(mailId);
  if (!entry || choice === "保留") return undefined;
  if (/^SCH-\d{4}-\d{3}$/.test(choice)) {
    linkMailToCase(choice, mailId);
    await processScheduleMailEntry(findTriageEntry(mailId)!);
    return findSchedulingCase(choice);
  }
  if (choice === "新規起票") return createSafeScheduleIntake(entry);
  return undefined;
}

export async function processScheduleMailEntry(
  entry: MailTriageEntry
): Promise<ProcessScheduleMailResult> {
  if (entry.schedule_reply_parsed) {
    return { mail_id: entry.id, action: "skipped", reason: "already processed" };
  }
  if (entry.disposition === "spam" || entry.routing !== "secretary") {
    return { mail_id: entry.id, action: "skipped", reason: "not secretary routing" };
  }

  if (!isScheduleIntent(entry)) {
    return { mail_id: entry.id, action: "skipped", reason: "not schedule intent" };
  }

  let caseRow = findCaseForMailEntry(entry);
  if (!caseRow) {
    const matches = matchingCaseIds(entry);
    if (matches.length > 1) {
      askUnlinkedScheduleChoice(entry, matches);
    } else {
      const created = createSafeScheduleIntake(entry);
      if (created) {
        return {
          mail_id: entry.id,
          case_id: created.id,
          action: "linked",
          reason: "safe intake created; awaiting confirmation",
        };
      }
    }
    return {
      mail_id: entry.id,
      action: "unlinked",
      reason: hasAmbiguousCaseMatch(entry) ? "ambiguous case match; needs review" : "no matching case",
    };
  }
  if (caseRow.processed_mail_ids.includes(entry.id)) {
    return {
      mail_id: entry.id,
      case_id: caseRow.id,
      action: "skipped",
      reason: "already processed",
    };
  }
  if (
    caseRow.status === "needs_review" &&
    caseRow.mail_thread_ids.includes(entry.id)
  ) {
    return {
      mail_id: entry.id,
      case_id: caseRow.id,
      action: "skipped",
      reason: "awaiting manual review",
    };
  }

  const email = extractEmailAddress(entry.from);
  const participant = findParticipantByEmail(caseRow, email);
  const body = await readMailBody(entry);
  const parsed = interpretScheduleReply(body, caseRow.proposed_slots, entry.id);

  const threadIds = new Set(caseRow.mail_thread_ids);
  threadIds.add(entry.id);

  let participants = caseRow.participants;
  if (participant && !parsed.needs_review && parsed.response !== "unknown") {
    participants = caseRow.participants.map((p) => {
      if (p.id !== participant.id) return p;
      return {
        ...p,
        response: parsed.response === "unknown" ? p.response : parsed.response,
        accepted_slot_id:
          parsed.response === "accept" ? parsed.slot_ids[0] : undefined,
        response_note: parsed.note ?? p.response_note,
        responded_at: new Date().toISOString(),
        responded_mail_id: entry.id,
      };
    });
  }

  let status = caseRow.status;
  if (status === "open" || status === "proposing") {
    status = "awaiting_responses";
  }

  let counterRound = caseRow.counter_round;
  let proposedSlots = caseRow.proposed_slots;
  let proposalRevision = caseRow.proposal_revision;
  if (participant && parsed.response === "counter" && !parsed.needs_review) {
    counterRound += 1;
    if (counterRound < 3) {
      const explicit = parsed.counter_slots.find((slot) => slot.start.includes("T"));
      const from =
        explicit?.start.slice(0, 10) ??
        parsed.counter_dates[0] ??
        caseRow.search_from ??
        new Date().toISOString().slice(0, 10);
      const exact = explicit
        ? [{
            id: nextSlotId(caseRow.proposed_slots),
            start: explicit.start,
            end: explicit.end ?? addMinutes(explicit.start, caseRow.duration_minutes),
            label: explicit.label,
          }]
        : [];
      proposedSlots = [
        ...exact,
        ...proposeExecutiveSlots({
          from,
          count: 3 - exact.length,
          durationMinutes: caseRow.duration_minutes,
          existingSlots: [...caseRow.proposed_slots, ...exact],
        }),
      ];
      proposalRevision += 1;
      participants = caseRow.participants.map((p) => ({
        ...p,
        response: "pending" as const,
        accepted_slot_id: undefined,
        response_note: undefined,
        responded_at: undefined,
        responded_mail_id: undefined,
      }));
      status = "proposing";
    } else {
      status = "awaiting_ceo";
    }
  }

  const recognized =
    Boolean(participant) && parsed.response !== "unknown" && !parsed.needs_review;
  const desired = applyNextAction({
    ...caseRow,
    participants,
    proposed_slots: proposedSlots,
    counter_round: counterRound,
    proposal_revision: proposalRevision,
    reminder_due_at: undefined,
    reminder_targets: [],
    ceo_question_id: undefined,
    pending_slot_id: undefined,
    mail_thread_ids: [...threadIds],
    status,
    processed_mail_ids: recognized
      ? [...new Set([...caseRow.processed_mail_ids, entry.id])]
      : caseRow.processed_mail_ids,
    exception_reason: recognized
      ? undefined
      : participant
        ? parsed.needs_review
          ? `schedule_reply_needs_review:${parsed.dissent.join("|") || "low_confidence"}`
          : "schedule_reply_unknown"
        : "schedule_sender_not_participant",
    updated_at: new Date().toISOString(),
  });
  if (!recognized) {
    desired.status = "needs_review";
    desired.next_action = "none";
  }
  caseRow = updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);
  if (recognized && parsed.response === "counter") {
    dismissPendingSchedulingQuestions(caseRow.id);
    const refreshed = findSchedulingCase(caseRow.id);
    if (refreshed?.next_action === "send_proposal") {
      const { ensureSchedulingCorrespondenceDrafts } = await import("./correspondence-drafts.js");
      const { maybeAutoSendAuthorizedProposals } = await import("./delegated-send.js");
      ensureSchedulingCorrespondenceDrafts(refreshed.id, "proposal");
      caseRow = (await maybeAutoSendAuthorizedProposals(refreshed.id)) ?? refreshed;
    }
  }

  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseRow.id,
    schedule_reply_parsed: recognized,
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
    action: recognized ? "updated" : "linked",
    reason: recognized
      ? `response=${parsed.response}`
      : `needs_review:${caseRow.exception_reason}`,
  };
}

export async function processAllScheduleMails(opts?: {
  mailIds?: string[];
}): Promise<ProcessScheduleMailResult[]> {
  const results: ProcessScheduleMailResult[] = [];
  const ids = opts?.mailIds;

  if (ids?.length) {
    for (const id of ids) {
      const entry = findTriageEntry(id);
      if (entry) {
        results.push(await processScheduleMailEntry(entry));
      }
    }
    return results;
  }

  const { listTriageEntries } = await import("../correspondence/mail-triage-queue.js");
  const entries = listTriageEntries({ limit: 200 }).filter(
    (e) =>
      e.routing === "secretary" &&
      e.disposition !== "spam" &&
      !e.schedule_reply_parsed &&
      (isScheduleIntent(e) || e.scheduling_case_id)
  );

  for (const entry of entries) {
    results.push(await processScheduleMailEntry(entry));
  }
  return results;
}
