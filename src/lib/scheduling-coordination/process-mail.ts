import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import type { MailTriageEntry } from "../../../schemas/correspondence/mail-triage.js";
import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { findMailInterpretation } from "../correspondence/mail-interpretation.js";
import { findTriageEntry, upsertTriageEntry } from "../correspondence/mail-triage-queue.js";
import { getMailReceivedDir } from "../correspondence/paths.js";
import { writeInboundHandoffDraft } from "../correspondence/mail-handoff.js";
import {
  askCeoInline,
  dismissPendingSchedulingQuestions,
  loadCeoInlineQueue,
} from "../correspondence/ceo-inline-question.js";
import { applyNextAction } from "./next-action.js";
import { extractEmailAddress } from "./reply-parse.js";
import { interpretScheduleReply } from "./reply-interpret.js";
import { proposeExecutiveSlots } from "./slots.js";
import {
  findSchedulingCase,
  listSchedulingCases,
  loadSchedulingCases,
  nextSchedulingCaseId,
  nextSlotId,
  updateSchedulingCase,
  upsertSchedulingCase,
} from "./store.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";

export interface ProcessScheduleMailResult {
  mail_id: string;
  case_id?: string;
  action: "linked" | "updated" | "skipped" | "unlinked";
  reason?: string;
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re:\s*)+/i, "")
    .replace(/^【日程調整】/, "")
    .replace(/^【日程確定】/, "")
    .trim()
    .toLowerCase();
}

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

export function findCaseForMailEntry(entry: MailTriageEntry): SchedulingCase | undefined {
  if (entry.scheduling_case_id) {
    return findSchedulingCase(entry.scheduling_case_id);
  }

  const cases = listSchedulingCases({ activeOnly: true });
  if (entry.mail_thread_ids?.length) {
    const matches = cases.filter((caseRow) =>
      caseRow.mail_thread_ids.some((id) => entry.mail_thread_ids!.includes(id))
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return undefined;
  }

  const messageIds = [entry.id, entry.source_message_id].filter(Boolean) as string[];
  const matches = cases.filter((c) => messageIds.some((id) => c.mail_thread_ids.includes(id)));
  if (matches.length === 1) return matches[0];

  // Subject and sender-only matching is intentionally excluded: forwarded or
  // repeated meeting subjects are ambiguous and must be linked explicitly.
  return undefined;
}

function hasAmbiguousCaseMatch(entry: MailTriageEntry): boolean {
  if (entry.scheduling_case_id) return false;
  const ids = new Set(
    [entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(
      Boolean
    ) as string[]
  );
  return (
    listSchedulingCases({ activeOnly: true }).filter((c) =>
      c.mail_thread_ids.some((id) => ids.has(id))
    ).length > 1
  );
}

function matchingCaseIds(entry: MailTriageEntry): string[] {
  const ids = new Set(
    [entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(
      Boolean
    ) as string[]
  );
  return listSchedulingCases({ activeOnly: true })
    .filter((row) => row.mail_thread_ids.some((id) => ids.has(id)))
    .map((row) => row.id);
}

function askUnlinkedScheduleChoice(entry: MailTriageEntry, caseIds: string[]): void {
  const existing = loadUnlinkedQuestion(entry.id);
  if (existing) return;
  askCeoInline({
    mailId: `schedule-intake:${entry.id}`,
    subject: `日程メールの紐付け確認 — ${entry.subject}`,
    contextL1: "既存案件との紐付けが一意に決まりません。1件選択してください。",
    fields: [
      {
        id: "schedule_intake_choice",
        label: "紐付け先",
        type: "choice",
        choices: [...caseIds, "新規起票", "保留"],
      },
    ],
  });
}

function loadUnlinkedQuestion(mailId: string) {
  return loadCeoInlineQueue().questions.find(
    (question) => question.mail_id === `schedule-intake:${mailId}` && question.status === "pending"
  );
}

function addMinutes(start: string, minutes: number): string {
  const value = new Date(`${start}:00`);
  value.setMinutes(value.getMinutes() + minutes);
  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(
    2,
    "0"
  )}`;
  return `${date}T${time}`;
}

function findParticipantByEmail(
  caseRow: SchedulingCase,
  email: string
): SchedulingParticipant | undefined {
  const lower = email.toLowerCase();
  return caseRow.participants.find((p) => p.email?.toLowerCase() === lower);
}

function isScheduleIntent(entry: MailTriageEntry): boolean {
  const interp = findMailInterpretation(entry.id);
  if (interp?.intent === "schedule") return true;
  const text = `${entry.subject} ${entry.rule_hits.join(" ")}`.toLowerCase();
  return /日程|スケジュール|schedule|候補|調整/.test(text);
}

function senderDisplayName(from: string): string {
  return (
    from
      .replace(/<[^>]+>/g, "")
      .replace(/^["']|["']$/g, "")
      .trim() || "ご担当者"
  );
}

function createSafeScheduleIntake(entry: MailTriageEntry): SchedulingCase | undefined {
  const email = entry.sender_email ?? extractEmailAddress(entry.from);
  if (!entry.sender_known || !email || !entry.subject.trim()) return undefined;
  const now = new Date().toISOString();
  const file = loadSchedulingCases();
  const caseRow = upsertSchedulingCase(
    applyNextAction({
      id: nextSchedulingCaseId(file.cases),
      title: normalizeSubject(entry.subject) || "日程調整",
      status: "needs_review",
      created_at: now,
      updated_at: now,
      participants: [
        {
          id: "PART-001",
          name: senderDisplayName(entry.from),
          email,
          contact_ref: entry.sender_contact_ref,
          role: "external",
          response: "pending",
        },
      ],
      proposed_slots: [],
      duration_minutes: 60,
      mail_thread_ids: [
        ...new Set(
          [entry.id, entry.source_message_id, ...(entry.mail_thread_ids ?? [])].filter(Boolean)
        ),
      ] as string[],
      processed_mail_ids: [],
      exception_reason: "schedule_intake_confirmation_required",
      next_action: "none",
    })
  );
  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseRow.id,
    mail_thread_ids: caseRow.mail_thread_ids,
  });
  recordSchedulingLifecycleEvent(caseRow.id, "created", "mail-intake");
  askCeoInline({
    mailId: `schedule-intake-case:${caseRow.id}:${entry.id}`,
    subject: `日程調整の起票確認 — ${caseRow.title}`,
    contextL1: `${senderDisplayName(entry.from)}からの日程メールを安全保留で起票しました。`,
    fields: [
      {
        id: "schedule_intake_choice",
        label: "この案件として調整を開始しますか？",
        type: "choice",
        choices: ["続行", "中止"],
      },
    ],
  });
  return findSchedulingCase(caseRow.id) ?? caseRow;
}

export async function applyScheduleIntakeAnswer(
  question: CeoInlineQuestion
): Promise<SchedulingCase | undefined> {
  const choice = question.answers?.schedule_intake_choice?.trim();
  if (!choice) return undefined;
  const caseMatch = question.mail_id.match(/^schedule-intake-case:(SCH-\d{4}-\d{3}):(.+)$/);
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

export function linkMailToCase(caseId: string, mailId: string): SchedulingCase {
  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new Error(`Scheduling case ${caseId} not found`);

  const entry = findTriageEntry(mailId);
  if (!entry) throw new Error(`Mail triage entry ${mailId} not found`);

  const threadIds = new Set(caseRow.mail_thread_ids);
  threadIds.add(mailId);
  if (entry.source_message_id) threadIds.add(entry.source_message_id);

  const desired = applyNextAction({
    ...caseRow,
    mail_thread_ids: [...threadIds],
    updated_at: new Date().toISOString(),
  });
  const result = updateSchedulingCase(caseRow.id, caseRow.revision, () => desired);

  upsertTriageEntry({
    ...entry,
    scheduling_case_id: caseId,
    mail_thread_ids: [...new Set([...(entry.mail_thread_ids ?? []), ...result.mail_thread_ids])],
  });

  return result;
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
      reason: hasAmbiguousCaseMatch(entry)
        ? "ambiguous case match; needs review"
        : "no matching case",
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
  if (caseRow.status === "needs_review" && caseRow.mail_thread_ids.includes(entry.id)) {
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
        accepted_slot_id: parsed.response === "accept" ? parsed.slot_ids[0] : undefined,
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
        ? [
            {
              id: nextSlotId(caseRow.proposed_slots),
              start: explicit.start,
              end: explicit.end ?? addMinutes(explicit.start, caseRow.duration_minutes),
              label: explicit.label,
            },
          ]
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

  const recognized = Boolean(participant) && parsed.response !== "unknown" && !parsed.needs_review;
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
      const { ensureSchedulingCorrespondenceDrafts, maybeAutoSendAuthorizedProposals } =
        await import("./lifecycle.js");
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
    reason: recognized ? `response=${parsed.response}` : `needs_review:${caseRow.exception_reason}`,
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
