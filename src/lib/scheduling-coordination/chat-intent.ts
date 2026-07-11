import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { SchedulingCase, SchedulingParticipant } from "../../../schemas/executive/scheduling-cases.js";
import { resolveContactRegistry } from "../secretary/contact-registry.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { applyNextAction } from "./next-action.js";
import { recordSchedulingLifecycleEvent } from "./lifecycle.js";
import {
  loadSchedulingCases,
  nextSchedulingCaseId,
  insertSchedulingCase,
  updateSchedulingCase,
} from "./store.js";

const SCHEDULE_INTENT =
  /(?:日程|スケジュール).{0,8}(?:調整|合わせ)|(?:\d+)\s*名.{0,12}(?:日程|調整|会議|MTG|打合せ)|(?:会議|MTG|打合せ).{0,8}(?:調整|設定)/i;

const COUNT_PATTERN = /(\d+)\s*名/;
const TITLE_PATTERNS = [
  /「([^」]+)」.{0,12}(?:日程|調整)/,
  /(?:日程調整|スケジュール調整)[：:]\s*([^。\n]+)/,
  /(?:会議|MTG|打合せ)[「『:]([^」』。\n]+)/i,
  /(?:^|[、。\s])([^、。\n]{2,40}?)(?:の)?(?:日程|スケジュール)(?:調整|を調整)/,
];

const schedulingChatParticipantSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  contact_ref: z.string().optional(),
  role: z.enum(["internal", "external"]).default("external"),
});

const schedulingChatDraftSchema = z.object({
  thread_id: z.string().min(1),
  status: z.enum(["collecting", "completed"]),
  turn_count: z.number().int().positive(),
  title: z.string().optional(),
  participants: z.array(schedulingChatParticipantSchema).default([]),
  participant_count: z.number().int().positive().optional(),
  duration_minutes: z.number().int().positive().optional(),
  meeting_format: z.enum(["online", "in_person"]).optional(),
  location: z.string().optional(),
  case_id: z.string().optional(),
  last_message_normalized: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

const schedulingChatDraftFileSchema = z.object({
  version: z.literal(1).default(1),
  drafts: z.array(schedulingChatDraftSchema).default([]),
});

type SchedulingChatDraft = z.output<typeof schedulingChatDraftSchema>;

export interface SchedulingChatResult {
  handled: boolean;
  reply?: string;
  caseRow?: SchedulingCase;
  draft?: SchedulingChatDraft;
}

export function isSchedulingChatIntent(message: string): boolean {
  return SCHEDULE_INTENT.test(message.trim());
}

function extractTitle(message: string): string | undefined {
  for (const p of TITLE_PATTERNS) {
    const m = message.match(p);
    if (m?.[1]?.trim()) {
      return m[1]
        .replace(/^\d+\s*名で?/, "")
        .trim()
        .slice(0, 80);
    }
  }
  return undefined;
}

function extractContinuationTitle(message: string): string | undefined {
  const first = message.split(/[\n,、;；]/u)[0]?.trim();
  if (
    !first ||
    first.length > 80 ||
    /@|\b(?:EXT|STK)-\d+\b|(?:参加者|出席者|メンバー|所要|オンライン|対面)/iu.test(first)
  ) {
    return undefined;
  }
  return first.replace(/^(?:タイトル|件名)(?:は|：|:)?\s*/u, "").trim() || undefined;
}

function extractParticipantCount(message: string): number | undefined {
  const m = message.match(COUNT_PATTERN);
  if (m) return Math.min(Math.max(parseInt(m[1]!, 10), 2), 12);
  return undefined;
}

function chatDraftPath(): string {
  return join(getDataDir(), "executive", "scheduling-chat-drafts.yaml");
}

function loadChatDrafts(): z.output<typeof schedulingChatDraftFileSchema> {
  const path = chatDraftPath();
  if (!existsSync(path)) return { version: 1, drafts: [] };
  return readYamlFile(path, schedulingChatDraftFileSchema);
}

function saveChatDraft(draft: SchedulingChatDraft): SchedulingChatDraft {
  const file = loadChatDrafts();
  const parsed = schedulingChatDraftSchema.parse(draft);
  const index = file.drafts.findIndex((row) => row.thread_id === parsed.thread_id);
  if (index >= 0) file.drafts[index] = parsed;
  else file.drafts.push(parsed);
  mkdirSync(join(getDataDir(), "executive"), { recursive: true });
  writeYamlFile(chatDraftPath(), schedulingChatDraftFileSchema.parse(file));
  return parsed;
}

export function findSchedulingChatDraft(threadId: string): SchedulingChatDraft | undefined {
  return loadChatDrafts().drafts.find((row) => row.thread_id === threadId);
}

function normalizeMessage(message: string): string {
  return message.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractDuration(message: string): number | undefined {
  const hours = message.match(/(\d+(?:\.\d+)?)\s*時間/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minutes = message.match(/(\d+)\s*分/);
  if (minutes) return Number(minutes[1]);
  return undefined;
}

function extractMeetingFormat(message: string): "online" | "in_person" | undefined {
  if (/(?:オンライン|online|zoom|meet|teams|web会議)/i.test(message)) return "online";
  if (/(?:対面|訪問|来社|会議室|in[\s-]?person)/i.test(message)) return "in_person";
  return undefined;
}

function extractLocation(message: string): string | undefined {
  return message
    .match(/(?:場所|会場)(?:は|：|:)\s*([^、。\n]+)/u)?.[1]
    ?.trim()
    .slice(0, 120);
}

function cleanParticipantName(raw: string): string {
  const afterLabel = raw.split(/(?:参加者|出席者|メンバー)(?:は|：|:)\s*/u).at(-1) ?? raw;
  return afterLabel
    .replace(/^.*[。]\s*/u, "")
    .replace(/[<（(\[]+$/u, "")
    .replace(/(?:さん|様)$/u, "")
    .trim();
}

function extractParticipants(message: string): Array<z.output<typeof schedulingChatParticipantSchema>> {
  const found: Array<z.output<typeof schedulingChatParticipantSchema>> = [];
  const segments = message.split(/[\n,、;；]+/u);
  for (const segment of segments) {
    const email = segment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const contactRef = segment.match(/\b(?:EXT|STK)-\d+\b/i)?.[0]?.toUpperCase();
    if (!email && !contactRef) continue;
    const marker = email ?? contactRef!;
    const before = segment.slice(0, segment.indexOf(marker));
    const name = cleanParticipantName(before.replace(/[<（(\[]\s*$/u, ""));
    if (!name || /(?:日程|調整|所要|形式|オンライン|対面)/u.test(name)) continue;

    let resolvedEmail = email;
    let resolvedRef = contactRef;
    if (contactRef) {
      const lookup = contactRef.startsWith("EXT-")
        ? resolveContactRegistry({ extId: contactRef })
        : resolveContactRegistry({ stakeholderId: contactRef });
      if (lookup.matches.length === 1) {
        resolvedEmail ??= lookup.matches[0]!.email;
        resolvedRef = lookup.matches[0]!.ref;
      }
    }
    found.push({
      name,
      email: resolvedEmail,
      contact_ref: resolvedRef,
      role: "external",
    });
  }
  return found.filter(
    (participant, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.email?.toLowerCase() === participant.email?.toLowerCase() &&
          candidate.contact_ref === participant.contact_ref &&
          candidate.name === participant.name
      ) === index
  );
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

  const caseRow = applyNextAction({
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
  const normalized = normalizeMessage(message);
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
  const participants = extractParticipants(message);
  const draft = schedulingChatDraftSchema.parse({
    ...base,
    status: "collecting",
    turn_count: base.turn_count + 1,
    title:
      extractTitle(message) ??
      (continuing ? extractContinuationTitle(message) : undefined) ??
      base.title,
    participants: participants.length > 0 ? participants : base.participants,
    participant_count: extractParticipantCount(message) ?? base.participant_count,
    duration_minutes: extractDuration(message) ?? base.duration_minutes,
    meeting_format: extractMeetingFormat(message) ?? base.meeting_format,
    location: extractLocation(message) ?? base.location,
    last_message_normalized: normalized,
    updated_at: now,
  });
  const missing = missingFields(draft);
  if (missing.length > 0) {
    const saved = saveChatDraft(draft);
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
  const completed = saveChatDraft({
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
  const result = handleSchedulingChatMessage(`legacy:${normalizeMessage(message)}`, message);
  return result.caseRow;
}
