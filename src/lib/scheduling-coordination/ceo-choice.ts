import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import type { CeoInlineQuestion } from "../../../schemas/correspondence/ceo-inline-question.js";

export type ParsedSchedulingCeoChoice =
  | { kind: "confirm_slot"; slotId: string }
  | { kind: "repropose" }
  | { kind: "cancel" }
  | { kind: "manual_coordination" }
  | { kind: "invalid" };

function normalizeChoice(value: string): string {
  return value.trim().toLowerCase();
}

function isYesChoice(value: string): boolean {
  const norm = normalizeChoice(value);
  return (
    norm === "yes" ||
    norm === "はい" ||
    norm === "true" ||
    norm.startsWith("はい") ||
    norm.includes("確定")
  );
}

function isCancelChoice(value: string): boolean {
  const norm = normalizeChoice(value);
  return norm === "中止" || norm === "cancel";
}

function isReproposeChoice(value: string): boolean {
  const norm = normalizeChoice(value);
  return norm === "再提案" || norm === "repropose";
}

export function buildSchedulingCeoChoices(caseRow: SchedulingCase): {
  fieldId: "schedule_ceo_choice";
  label: string;
  choices: string[];
} {
  if (caseRow.exception_reason === "schedule_counter_limit") {
    return {
      fieldId: "schedule_ceo_choice",
      label: "再調整が3回に達しました。手動調整か中止を選んでください",
      choices: ["手動調整", "中止"],
    };
  }

  if (caseRow.exception_reason === "schedule_split_accept") {
    return {
      fieldId: "schedule_ceo_choice",
      label: "回答が候補間で分かれています。確定する候補を1つ選んでください",
      choices: [
        ...caseRow.proposed_slots.map(
          (slot) => `${slot.id} ${slot.label ?? slot.start}（確定・通知）`
        ),
        "再提案",
        "中止",
      ],
    };
  }

  return {
    fieldId: "schedule_ceo_choice",
    label: "この日時で確定し、参加者へ確定通知を送信してよろしいですか？",
    choices: ["はい（確定・通知送信）", "再提案", "中止"],
  };
}

export function resolveSchedulingCeoChoice(
  question: CeoInlineQuestion,
  caseRow: SchedulingCase
): ParsedSchedulingCeoChoice {
  const unified = question.answers?.schedule_ceo_choice?.trim();
  const legacyConfirm = question.answers?.schedule_confirm?.trim();
  const legacySlot = question.answers?.schedule_slot_choice?.trim();
  const legacyException = question.answers?.schedule_exception_choice?.trim();
  const raw = unified ?? legacySlot ?? legacyException ?? legacyConfirm;
  if (!raw) return { kind: "invalid" };

  if (isCancelChoice(raw)) return { kind: "cancel" };
  if (isReproposeChoice(raw)) return { kind: "repropose" };

  if (caseRow.exception_reason === "schedule_counter_limit") {
    const norm = normalizeChoice(raw);
    if (norm === "手動調整" || norm === "manual") {
      return { kind: "manual_coordination" };
    }
    return { kind: "invalid" };
  }

  const slotId = raw.match(/SLOT-\d{3}/)?.[0];
  if (slotId && caseRow.proposed_slots.some((slot) => slot.id === slotId)) {
    return { kind: "confirm_slot", slotId };
  }

  if (isYesChoice(raw)) {
    const pending = caseRow.pending_slot_id;
    if (pending && caseRow.proposed_slots.some((slot) => slot.id === pending)) {
      return { kind: "confirm_slot", slotId: pending };
    }
    return { kind: "invalid" };
  }

  return { kind: "invalid" };
}
