import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { tenantDataPath } from "../tenant.js";

/** Max conversation turns (user+assistant pairs) kept on disk. */
export const CHAT_HISTORY_TURN_OPTIONS = [5, 10, 20] as const;
export type ChatHistoryMaxTurns = (typeof CHAT_HISTORY_TURN_OPTIONS)[number];

/** @deprecated Prefer getChatHistoryMaxTurns(); kept for tests / callers. */
export const CHAT_THREAD_MAX_TURNS = 20;

export const chatThreadMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  at: z.string(),
});

export const chatThreadSchema = z.object({
  thread_id: z.string(),
  tenant: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  messages: z.array(chatThreadMessageSchema),
});

const chatSettingsSchema = z.object({
  max_turns: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
});

export type ChatThread = z.output<typeof chatThreadSchema>;
export type ChatThreadMessage = z.output<typeof chatThreadMessageSchema>;
export type ChatSettings = z.output<typeof chatSettingsSchema>;

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

export function getChatHistoryMaxTurns(): ChatHistoryMaxTurns {
  const path = settingsPath();
  if (!existsSync(path)) return 10;
  try {
    const parsed = chatSettingsSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
    return parsed.max_turns;
  } catch {
    return 10;
  }
}

export function getChatSettings(): ChatSettings {
  return { max_turns: getChatHistoryMaxTurns() };
}

export function setChatHistoryMaxTurns(maxTurns: ChatHistoryMaxTurns): ChatSettings {
  if (!CHAT_HISTORY_TURN_OPTIONS.includes(maxTurns)) {
    throw new Error(`max_turns must be one of ${CHAT_HISTORY_TURN_OPTIONS.join(",")}`);
  }
  const next = chatSettingsSchema.parse({ max_turns: maxTurns });
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

export function appendChatTurn(
  threadId: string,
  tenant: string,
  userMessage: string,
  assistantReply: string
): ChatThread {
  const thread = loadChatThread(threadId, tenant);
  const now = new Date().toISOString();
  const last = thread.messages[thread.messages.length - 1];
  // If the user turn was already persisted at request start, only append the reply.
  if (
    last &&
    last.role === "user" &&
    last.content === userMessage
  ) {
    thread.messages.push({
      role: "assistant",
      content: assistantReply,
      at: now,
    });
  } else {
    thread.messages.push(
      { role: "user", content: userMessage, at: now },
      { role: "assistant", content: assistantReply, at: now },
    );
  }
  return saveChatThread(thread);
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
  thread.messages.push({ role: "user", content: userMessage, at: now });
  return saveChatThread(thread);
}

export function historyForOperator(
  thread: ChatThread
): Array<{ role: "user" | "assistant"; content: string }> {
  return thread.messages.map((m) => ({ role: m.role, content: m.content }));
}
