import type { SchedulingCase, SchedulingParticipant } from "../../../schemas/executive/scheduling-cases.js";
import { resolveContactRegistry } from "../secretary/contact-registry.js";
import { resolveNextAction } from "./judgment-context.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle-events.js";
import {
  loadSchedulingCases,
  nextSchedulingCaseId,
  insertSchedulingCase,
} from "./store.js";
import {
  extractSchedulingChatContinuationTitle,
  extractSchedulingChatDuration,
  extractSchedulingChatLocation,
  extractSchedulingChatMeetingFormat,
  extractSchedulingChatParticipantCount,
  extractSchedulingChatParticipants,
  extractSchedulingChatTitle,
  isSchedulingChatIntent,
  normalizeSchedulingChatMessage,
} from "./chat-parse.js";
import {
  findSchedulingChatDraft,
  saveSchedulingChatDraft,
  schedulingChatDraftSchema,
  type SchedulingChatDraft,
} from "./chat-draft-store.js";

export { isSchedulingChatIntent } from "./chat-parse.js";
export { findSchedulingChatDraft } from "./chat-draft-store.js";

export interface SchedulingChatResult {
  handled: boolean;
  reply?: string;
  caseRow?: SchedulingCase;
  draft?: SchedulingChatDraft;
}

function missingFields(draft: SchedulingChatDraft): string[] {
  const missing: string[] = [];
  if (!draft.title) missing.push("タイトル");
  if (draft.participants.length === 0) {
    missing.push("参加者名と email または contact_ref");
  } else if (draft.participants.some((participant) => !participant.email)) {
    missing.push("解決可能な全参加者の email または contact_ref");
  }
  if (
    draft.participant_count !== undefined &&
    draft.participants.length !== draft.participant_count
  ) {
    missing.push(`参加者 ${draft.participant_count} 名分の連絡先`);
  }
  if (!draft.duration_minutes) missing.push("所要時間");
  if (!draft.meeting_format) missing.push("形式（オンライン／対面）");
  if (draft.meeting_format === "in_person" && !draft.location) missing.push("場所");
  return [...new Set(missing)];
}

function createCaseFromDraft(draft: SchedulingChatDraft): SchedulingCase {
  const file = loadSchedulingCases();
  const now = new Date().toISOString();
  const participants: SchedulingParticipant[] = draft.participants.map((participant, index) => ({
    id: `PART-${String(index + 1).padStart(3, "0")}`,
    name: participant.name,
    email: participant.email,
    contact_ref: participant.contact_ref,
    role: participant.role,
    response: "pending",
  }));

  const caseRow = resolveNextAction({
    id: nextSchedulingCaseId(file.cases),
    title: draft.title!,
    status: "open",
    created_at: now,
    updated_at: now,
    participants,
    proposed_slots: [],
    duration_minutes: draft.duration_minutes!,
    meeting_format: draft.meeting_format!,
    location: draft.location,
    mail_thread_ids: [],
    source: "chat",
    notes: `chat-thread:${draft.thread_id}`,
    next_action: "propose_slots",
  });

  insertSchedulingCase(caseRow);
  return recordSchedulingLifecycleEvent(caseRow.id, "created", "chat");
}

function formatSchedulingChatAck(caseRow: SchedulingCase): string {
  return [
    `日程調整案件 **${caseRow.id}** を起票しました（${caseRow.title}）。`,
    `参加者 ${caseRow.participants.length} 名 · ${caseRow.duration_minutes} 分 · ${caseRow.meeting_format === "online" ? "オンライン" : "対面"}。候補日時の作成に進めます。`,
  ].join("\n");
}

export function handleSchedulingChatMessage(threadId: string, message: string): SchedulingChatResult {
  const normalized = normalizeSchedulingChatMessage(message);
  const existing = findSchedulingChatDraft(threadId);
  const continuing = existing?.status === "collecting";
  if (!continuing && !isSchedulingChatIntent(message)) return { handled: false };

  if (
    existing?.status === "completed" &&
    existing.last_message_normalized === normalized &&
    existing.case_id
  ) {
    const caseRow = loadSchedulingCases().cases.find((row) => row.id === existing.case_id);
    return {
      handled: true,
      reply: caseRow
        ? formatSchedulingChatAck(caseRow)
        : `日程調整案件 **${existing.case_id}** は起票済みです。`,
      caseRow,
      draft: existing,
    };
  }

  const now = new Date().toISOString();
  const base: SchedulingChatDraft =
    continuing && existing
      ? existing
      : {
          thread_id: threadId,
          status: "collecting",
          turn_count: 0,
          participants: [],
          created_at: now,
          updated_at: now,
        };
  const participants = extractSchedulingChatParticipants(message, resolveContactRegistry);
  const draft = schedulingChatDraftSchema.parse({
    ...base,
    status: "collecting",
    turn_count: base.turn_count + 1,
    title:
      extractSchedulingChatTitle(message) ??
      (continuing ? extractSchedulingChatContinuationTitle(message) : undefined) ??
      base.title,
    participants: participants.length > 0 ? participants : base.participants,
    participant_count: extractSchedulingChatParticipantCount(message) ?? base.participant_count,
    duration_minutes: extractSchedulingChatDuration(message) ?? base.duration_minutes,
    meeting_format: extractSchedulingChatMeetingFormat(message) ?? base.meeting_format,
    location: extractSchedulingChatLocation(message) ?? base.location,
    last_message_normalized: normalized,
    updated_at: now,
  });
  const missing = missingFields(draft);
  if (missing.length > 0) {
    const saved = saveSchedulingChatDraft(draft);
    return {
      handled: true,
      reply: [
        "案件はまだ起票していません。次の1回の返信で不足情報をまとめて教えてください。",
        `不足: ${missing.join("、")}。例: 「役員会、田中 tanaka@example.com、佐藤 EXT-002、60分、オンライン」`,
      ].join("\n"),
      draft: saved,
    };
  }

  const caseRow = createCaseFromDraft(draft);
  const completed = saveSchedulingChatDraft({
    ...draft,
    status: "completed",
    case_id: caseRow.id,
    updated_at: new Date().toISOString(),
  });
  return {
    handled: true,
    reply: formatSchedulingChatAck(caseRow),
    caseRow,
    draft: completed,
  };
}

/** Legacy direct entry point: complete one-message requests only; never creates placeholders. */
export function createSchedulingCaseFromChat(message: string): SchedulingCase | undefined {
  const result = handleSchedulingChatMessage(
    `legacy:${normalizeSchedulingChatMessage(message)}`,
    message
  );
  return result.caseRow;
}
