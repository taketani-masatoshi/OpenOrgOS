import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { tenantDataPath } from "../tenant.js";

/** Max conversation turns (user+assistant pairs) kept on disk. */
export const CHAT_HISTORY_TURN_OPTIONS = [5, 10, 20] as const;
export type ChatHistoryMaxTurns = (typeof CHAT_HISTORY_TURN_OPTIONS)[number];

/** @deprecated Prefer getChatHistoryMaxTurns(); kept for tests / callers. */
export const CHAT_THREAD_MAX_TURNS = 20;

/** Where an assistant reply came from (optional; legacy threads omit). */
export const CHAT_ANSWER_SOURCES = ["cloud", "local", "deterministic", "unknown", "faq"] as const;
export type ChatAnswerSource = (typeof CHAT_ANSWER_SOURCES)[number];

export const CHAT_FEEDBACK_RATINGS = ["good", "bad"] as const;
export type ChatFeedbackRating = (typeof CHAT_FEEDBACK_RATINGS)[number];

export const chatTurnMetaSchema = z.object({
  source: z.enum(CHAT_ANSWER_SOURCES).optional(),
  model: z.string().optional(),
  worker_id: z.string().optional(),
  turn_id: z.string().optional(),
});
export type ChatTurnMeta = z.output<typeof chatTurnMetaSchema>;

export const chatThreadMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  at: z.string(),
  turn_id: z.string().optional(),
  source: z.enum(CHAT_ANSWER_SOURCES).optional(),
  model: z.string().optional(),
  worker_id: z.string().optional(),
  feedback: z.enum(CHAT_FEEDBACK_RATINGS).optional(),
  feedback_at: z.string().optional(),
});

export const chatThreadSchema = z.object({
  thread_id: z.string(),
  tenant: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  messages: z.array(chatThreadMessageSchema),
});

const answerMemorySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  ttl_days: z.number().int().positive().default(30),
  max_hits: z.number().int().positive().max(5).default(2),
  min_score: z.number().min(0).max(1).default(0.35),
});

const chatSettingsSchema = z.object({
  max_turns: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
  answer_memory: answerMemorySettingsSchema.optional(),
});

export type ChatThread = z.output<typeof chatThreadSchema>;
export type ChatThreadMessage = z.output<typeof chatThreadMessageSchema>;
export type ChatSettings = z.output<typeof chatSettingsSchema>;
export type AnswerMemorySettings = z.output<typeof answerMemorySettingsSchema>;

export const DEFAULT_ANSWER_MEMORY_SETTINGS: AnswerMemorySettings = {
  enabled: true,
  ttl_days: 30,
  max_hits: 2,
  min_score: 0.35,
};

function chatRoot(): string {
  const dir = tenantDataPath("chat");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function threadsDir(): string {
  const dir = join(chatRoot(), "threads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function settingsPath(): string {
  return join(chatRoot(), "settings.json");
}

function threadPath(threadId: string): string {
  const safe = threadId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${threadsDir()}/${safe}.json`;
}

export function threadIdFromSessionToken(token: string | undefined): string {
  if (!token) return "anonymous";
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
}

function readChatSettingsFile(): ChatSettings {
  const path = settingsPath();
  if (!existsSync(path)) {
    return { max_turns: 10 };
  }
  try {
    return chatSettingsSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { max_turns: 10 };
  }
}

export function getChatHistoryMaxTurns(): ChatHistoryMaxTurns {
  return readChatSettingsFile().max_turns;
}

export function getChatSettings(): ChatSettings {
  return readChatSettingsFile();
}

export function getAnswerMemorySettings(): AnswerMemorySettings {
  const raw = readChatSettingsFile().answer_memory;
  if (!raw) return { ...DEFAULT_ANSWER_MEMORY_SETTINGS };
  return { ...DEFAULT_ANSWER_MEMORY_SETTINGS, ...raw };
}

export function setChatHistoryMaxTurns(maxTurns: ChatHistoryMaxTurns): ChatSettings {
  if (!CHAT_HISTORY_TURN_OPTIONS.includes(maxTurns)) {
    throw new Error(`max_turns must be one of ${CHAT_HISTORY_TURN_OPTIONS.join(",")}`);
  }
  const prev = readChatSettingsFile();
  const next = chatSettingsSchema.parse({ ...prev, max_turns: maxTurns });
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/** Max message rows stored (= turns × 2 for user+assistant pairs). */
export function chatHistoryMaxMessages(maxTurns = getChatHistoryMaxTurns()): number {
  return maxTurns * 2;
}

export function loadChatThread(threadId: string, tenant: string): ChatThread {
  const path = threadPath(threadId);
  if (!existsSync(path)) {
    const now = new Date().toISOString();
    return chatThreadSchema.parse({
      thread_id: threadId,
      tenant,
      created_at: now,
      updated_at: now,
      messages: [],
    });
  }
  const parsed = chatThreadSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  if (parsed.tenant !== tenant) {
    throw new Error("chat thread tenant mismatch");
  }
  return parsed;
}

/**
 * Load thread; when auth is off, migrate legacy `anonymous:*` threads into `local:*`.
 */
export function loadOrMigrateAgentThread(
  threadId: string,
  tenant: string,
  agentId?: string
): ChatThread {
  const thread = loadChatThread(threadId, tenant);
  if (process.env.STEWARD_CHAT_AUTH !== "0" || !agentId || thread.messages.length > 0) {
    return thread;
  }
  const legacyId = `anonymous:${agentId}`;
  if (legacyId === threadId) return thread;
  const legacy = loadChatThread(legacyId, tenant);
  if (legacy.messages.length === 0) return thread;
  return saveChatThread({
    ...legacy,
    thread_id: threadId,
    tenant,
  });
}

export function saveChatThread(thread: ChatThread): ChatThread {
  const maxMessages = chatHistoryMaxMessages();
  const trimmed =
    thread.messages.length > maxMessages
      ? thread.messages.slice(-maxMessages)
      : thread.messages;
  const next = chatThreadSchema.parse({
    ...thread,
    messages: trimmed,
    updated_at: new Date().toISOString(),
  });
  writeFileSync(threadPath(next.thread_id), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/** Re-save all threads under the current max (used after settings change). */
export function pruneAllChatThreadsToCurrentLimit(tenant: string): number {
  const dir = threadsDir();
  if (!existsSync(dir)) return 0;
  let pruned = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const threadId = name.replace(/\.json$/, "");
    try {
      const thread = loadChatThread(threadId, tenant);
      const before = thread.messages.length;
      const saved = saveChatThread(thread);
      if (saved.messages.length < before) pruned += 1;
    } catch {
      /* skip foreign / corrupt */
    }
  }
  return pruned;
}

/** Latest user turn with this text that does not yet have an assistant reply. */
export function findUnpairedUserIndex(
  messages: ChatThread["messages"],
  userMessage: string,
): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i];
    if (row?.role !== "user" || row.content !== userMessage) continue;
    const next = messages[i + 1];
    if (!next || next.role !== "assistant") return i;
  }
  return -1;
}

export function latestAssistantTurnId(thread: ChatThread): string | undefined {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const row = thread.messages[i];
    if (row?.role === "assistant" && row.turn_id) return row.turn_id;
  }
  return undefined;
}

export function findMessageByTurnId(
  thread: ChatThread,
  turnId: string,
): { message: ChatThreadMessage; index: number } | null {
  const index = thread.messages.findIndex((m) => m.turn_id === turnId);
  if (index < 0) return null;
  const message = thread.messages[index];
  if (!message) return null;
  return { message, index };
}

/** User message immediately before an assistant turn (same Q&A pair). */
export function pairedUserMessage(
  thread: ChatThread,
  assistantIndex: number,
): ChatThreadMessage | null {
  if (assistantIndex <= 0) return null;
  const prev = thread.messages[assistantIndex - 1];
  if (prev?.role !== "user") return null;
  return prev;
}

export function setMessageFeedback(
  threadId: string,
  tenant: string,
  turnId: string,
  rating: ChatFeedbackRating,
): { thread: ChatThread; assistant: ChatThreadMessage; userQuery: string } | null {
  const thread = loadChatThread(threadId, tenant);
  const found = findMessageByTurnId(thread, turnId);
  if (!found || found.message.role !== "assistant") return null;
  const user = pairedUserMessage(thread, found.index);
  if (!user) return null;
  const now = new Date().toISOString();
  thread.messages[found.index] = {
    ...found.message,
    feedback: rating,
    feedback_at: now,
  };
  const saved = saveChatThread(thread);
  const assistant = saved.messages[found.index]!;
  return { thread: saved, assistant, userQuery: user.content };
}

export function appendChatTurn(
  threadId: string,
  tenant: string,
  userMessage: string,
  assistantReply: string,
  meta?: ChatTurnMeta
): ChatThread {
  const thread = loadChatThread(threadId, tenant);
  const now = new Date().toISOString();
  const unpaired = findUnpairedUserIndex(thread.messages, userMessage);
  const metaFields = chatTurnMetaSchema.parse(meta ?? {});
  const assistantTurnId = metaFields.turn_id ?? randomUUID();
  const reply: ChatThreadMessage = {
    role: "assistant",
    content: assistantReply,
    at: now,
    ...metaFields,
    turn_id: assistantTurnId,
  };
  if (unpaired >= 0) {
    const userRow = thread.messages[unpaired];
    if (userRow && !userRow.turn_id) {
      thread.messages[unpaired] = { ...userRow, turn_id: randomUUID() };
    }
    thread.messages.splice(unpaired + 1, 0, reply);
  } else {
    thread.messages.push(
      { role: "user", content: userMessage, at: now, turn_id: randomUUID() },
      reply,
    );
  }
  return saveChatThread(thread);
}

/** List on-disk thread ids for the active tenant chat store. */
export function listChatThreadIds(): string[] {
  const dir = threadsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

/** Extract secretary / executive_steward from `{base}:{agent}` thread ids. */
export function agentIdFromThreadId(threadId: string): string | undefined {
  const idx = threadId.lastIndexOf(":");
  if (idx < 0) return undefined;
  const suffix = threadId.slice(idx + 1);
  if (suffix === "secretary" || suffix === "executive_steward") return suffix;
  return undefined;
}

/** Persist the user 依頼 immediately so navigation away cannot erase it. */
export function appendChatUserMessage(
  threadId: string,
  tenant: string,
  userMessage: string,
): ChatThread {
  const thread = loadChatThread(threadId, tenant);
  const now = new Date().toISOString();
  const last = thread.messages[thread.messages.length - 1];
  if (last?.role === "user" && last.content === userMessage) {
    return thread;
  }
  thread.messages.push({
    role: "user",
    content: userMessage,
    at: now,
    turn_id: randomUUID(),
  });
  return saveChatThread(thread);
}

function isLegacyTowerPlanReply(content: string): boolean {
  return content.includes("**司令塔プラン（確認待ち）**");
}

export function historyForOperator(
  thread: ChatThread
): Array<{ role: "user" | "assistant"; content: string }> {
  return thread.messages
    .filter((m) => m.role !== "assistant" || !isLegacyTowerPlanReply(m.content))
    .map((m) => ({ role: m.role, content: m.content }));
}
