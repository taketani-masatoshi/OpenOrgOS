import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { tenantDataPath } from "../tenant.js";

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

export type ChatThread = z.output<typeof chatThreadSchema>;
export type ChatThreadMessage = z.output<typeof chatThreadMessageSchema>;

function threadsDir(): string {
  const dir = tenantDataPath("chat", "threads");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function threadPath(threadId: string): string {
  const safe = threadId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${threadsDir()}/${safe}.json`;
}

export function threadIdFromSessionToken(token: string | undefined): string {
  if (!token) return "anonymous";
  return createHash("sha256").update(token).digest("hex").slice(0, 24);
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

export function saveChatThread(thread: ChatThread): ChatThread {
  const trimmed =
    thread.messages.length > CHAT_THREAD_MAX_TURNS
      ? thread.messages.slice(-CHAT_THREAD_MAX_TURNS)
      : thread.messages;
  const next = chatThreadSchema.parse({
    ...thread,
    messages: trimmed,
    updated_at: new Date().toISOString(),
  });
  writeFileSync(threadPath(next.thread_id), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

export function appendChatTurn(
  threadId: string,
  tenant: string,
  userMessage: string,
  assistantReply: string
): ChatThread {
  const thread = loadChatThread(threadId, tenant);
  const now = new Date().toISOString();
  thread.messages.push(
    { role: "user", content: userMessage, at: now },
    { role: "assistant", content: assistantReply, at: now }
  );
  return saveChatThread(thread);
}

export function historyForOperator(
  thread: ChatThread
): Array<{ role: "user" | "assistant"; content: string }> {
  return thread.messages.map((m) => ({ role: m.role, content: m.content }));
}
