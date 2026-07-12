import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";
import {
  askCeoInline,
  findCeoInlineQuestion,
  loadCeoInlineQueue,
} from "../correspondence/ceo-inline-question.js";
import { listCorrespondenceDrafts } from "../correspondence/draft.js";
import { findUnanimousAcceptedSlot } from "./slots.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";
import { syncSchedulingCaseCalendar } from "./calendar-write.js";
import { applyNextAction } from "./next-action.js";
import { findOperatorByApproverName, findOperatorById } from "../org/operators.js";
import { buildSchedulingCeoChoices, resolveSchedulingCeoChoice } from "./ceo-choice.js";
import {
  ensureSchedulingCorrespondenceDrafts,
  recordSchedulingLifecycleEvent,
  sendSchedulingConfirmationsAuthorizedByCeo,
} from "./lifecycle.js";

export const SCHEDULING_MAIL_PREFIX = "scheduling:";

export function schedulingMailId(caseId: string): string {
  return `${SCHEDULING_MAIL_PREFIX}${caseId}`;
}

export function parseSchedulingMailId(mailId: string): string | undefined {
  if (!mailId.startsWith(SCHEDULING_MAIL_PREFIX)) return undefined;
  return mailId.slice(SCHEDULING_MAIL_PREFIX.length);
}

function resolveConfirmSlot(caseRow: SchedulingCase) {
  const unanimous = findUnanimousAcceptedSlot(caseRow.participants, caseRow.proposed_slots);
  if (unanimous) return unanimous;
  if (caseRow.pending_slot_id) {
    return caseRow.proposed_slots.find((s) => s.id === caseRow.pending_slot_id);
  }
  const accepted = caseRow.participants.find((p) => p.accepted_slot_id);
  if (accepted?.accepted_slot_id) {
    return caseRow.proposed_slots.find((s) => s.id === accepted.accepted_slot_id);
  }
  return caseRow.proposed_slots[0];
}

function findCeoInlineQuestionBySchedulingCase(caseId: string): CeoInlineQuestion | undefined {
  return loadCeoInlineQueue().questions.find(
    (q) => q.scheduling_case_id === caseId && q.status === "pending"
  );
}

export function ensureSchedulingCeoConfirmQuestion(
  caseRow: SchedulingCase
): CeoInlineQuestion | undefined {
  if (caseRow.next_action !== "ceo_confirm") return undefined;

  const slot = resolveConfirmSlot(caseRow);
  const isCounterLimit = caseRow.exception_reason === "schedule_counter_limit";
  const isSplitAccept = caseRow.exception_reason === "schedule_split_accept";
  if (!slot && !isCounterLimit) return undefined;

  const byId = caseRow.ceo_question_id ? findCeoInlineQuestion(caseRow.ceo_question_id) : undefined;
  const byCase = findCeoInlineQuestionBySchedulingCase(caseRow.id);

  const pendingNames = caseRow.participants
    .filter((p) => p.response === "pending")
    .map((p) => p.name)
    .join("、");

  const participantSummary = caseRow.participants
    .map((p) => `${p.name}: ${p.response}${p.accepted_slot_id ? `(${p.accepted_slot_id})` : ""}`)
    .join("、");
  const ceoChoice = buildSchedulingCeoChoices(caseRow);
  const fields = [
    {
      id: ceoChoice.fieldId,
      label: ceoChoice.label,
      type: "choice" as const,
      choices: ceoChoice.choices,
    },
  ];

  const contextLines = [
    `${caseRow.title}`,
    isSplitAccept
      ? `回答: ${participantSummary}`
      : slot
        ? `候補: ${slot.label ?? slot.start}`
        : isCounterLimit
          ? "候補: counter上限到達"
          : undefined,
    pendingNames ? `未回答: ${pendingNames}` : isCounterLimit ? undefined : "全員回答済み",
    "選択でカレンダー反映と参加者への確定通知まで進みます",
  ].filter(Boolean);

  const question =
    byId?.status === "pending" || byCase
      ? (byId ?? byCase)!
      : askCeoInline({
          mailId: schedulingMailId(caseRow.id),
          schedulingCaseId: caseRow.id,
          subject: `日程確定 — ${caseRow.title}`,
          contextL1: contextLines.join("\n"),
          fields,
        });

  const latest = findSchedulingCase(caseRow.id) ?? caseRow;
  const pendingSlotId = isSplitAccept || isCounterLimit ? undefined : slot?.id;
  if (latest.ceo_question_id !== question.id || latest.pending_slot_id !== pendingSlotId) {
    updateSchedulingCase(latest.id, latest.revision, (current) => ({
      ...current,
      ceo_question_id: question.id,
      pending_slot_id: pendingSlotId,
      updated_at: new Date().toISOString(),
    }));
  }

  return question;
}

export function resolveCeoAuthorizeFromAnswer(
  answeredBy?: string
): { approverName: string; operatorId: string } | undefined {
  const raw = answeredBy?.trim();
  if (!raw) return undefined;

  const byApprover = findOperatorByApproverName(raw);
  if (byApprover && (byApprover.role === "ceo" || byApprover.role === "approver")) {
    return {
      approverName: byApprover.approver_name ?? byApprover.display_name,
      operatorId: byApprover.operator_id,
    };
  }

  const byId = findOperatorById(raw);
  if (byId && (byId.role === "ceo" || byId.role === "approver")) {
    return {
      approverName: byId.approver_name ?? byId.display_name ?? raw,
      operatorId: byId.operator_id,
    };
  }

  return undefined;
}

export async function confirmSchedulingCaseFromCeo(
  caseId: string,
  slotId: string,
  opts?: {
    pushCalendar?: boolean;
    ceoAuthorize?: { approverName: string; operatorId: string };
  }
): Promise<SchedulingCase> {
  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);
  const synced = await syncSchedulingCaseCalendar(caseId, slotId, {
    pushGoogle: opts?.pushCalendar !== false,
  });
  if (synced.calendar_sync !== "synced") return synced;
  recordSchedulingLifecycleEvent(caseId, "confirmed", "ceo");
  let current = ensureSchedulingCorrespondenceDrafts(caseId, "confirm");
  if (opts?.ceoAuthorize) {
    current = await sendSchedulingConfirmationsAuthorizedByCeo(caseId, {
      approverName: opts.ceoAuthorize.approverName,
      operatorId: opts.ceoAuthorize.operatorId,
    });
  }
  return current;
}

export async function applySchedulingCeoAnswer(
  question: CeoInlineQuestion
): Promise<SchedulingCase | undefined> {
  const caseId = question.scheduling_case_id ?? parseSchedulingMailId(question.mail_id);
  if (!caseId || question.status !== "answered" || !question.answers) return undefined;

  const caseRow = findSchedulingCase(caseId);
  if (!caseRow) throw new Error(`Case ${caseId} not found`);

  const choice = resolveSchedulingCeoChoice(question, caseRow);
  const authorize = resolveCeoAuthorizeFromAnswer(question.answered_by);

  switch (choice.kind) {
    case "manual_coordination":
      return updateSchedulingCase(caseRow.id, caseRow.revision, (current) =>
        applyNextAction({
          ...current,
          status: "needs_review",
          next_action: "none",
          ceo_question_id: undefined,
          exception_reason: "schedule_manual_coordination",
          updated_at: new Date().toISOString(),
        })
      );
    case "cancel":
      return updateSchedulingCase(caseRow.id, caseRow.revision, (current) =>
        applyNextAction({
          ...current,
          status: "cancelled",
          next_action: "none",
          proposed_slots: [],
          pending_slot_id: undefined,
          ceo_question_id: undefined,
          exception_reason: undefined,
          updated_at: new Date().toISOString(),
        })
      );
    case "repropose":
      return updateSchedulingCase(caseRow.id, caseRow.revision, (current) =>
        applyNextAction({
          ...current,
          status: "proposing",
          proposed_slots: [],
          pending_slot_id: undefined,
          ceo_question_id: undefined,
          exception_reason: undefined,
          updated_at: new Date().toISOString(),
        })
      );
    case "confirm_slot":
      return confirmSchedulingCaseFromCeo(caseId, choice.slotId, {
        pushCalendar: true,
        ceoAuthorize: authorize,
      });
    case "invalid":
      return updateSchedulingCase(caseRow.id, caseRow.revision, (current) => ({
        ...current,
        status: "needs_review",
        next_action: "none",
        ceo_question_id: undefined,
        exception_reason: "schedule_invalid_ceo_choice",
        updated_at: new Date().toISOString(),
      }));
  }
}

export function findPendingApprovalForCase(caseId: string): string | undefined {
  const prefix = `scheduling-case:${caseId}`;
  const drafts = listCorrespondenceDrafts({ status: "pending_approval", channel: "email" });
  const match = drafts.find((d) => d.notes?.includes(prefix) && d.approval_id);
  return match?.approval_id;
}
