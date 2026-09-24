import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";
import { schedulingChatParticipantSchema } from "./chat-parse.js";

export const schedulingChatDraftSchema = z.object({
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

export type SchedulingChatDraft = z.output<typeof schedulingChatDraftSchema>;

function chatDraftPath(): string {
  return join(getDataDir(), "executive", "scheduling-chat-drafts.yaml");
}

function loadChatDrafts(): z.output<typeof schedulingChatDraftFileSchema> {
  const path = chatDraftPath();
  if (!existsSync(path)) return { version: 1, drafts: [] };
  return readYamlFile(path, schedulingChatDraftFileSchema);
}

export function saveSchedulingChatDraft(draft: SchedulingChatDraft): SchedulingChatDraft {
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
