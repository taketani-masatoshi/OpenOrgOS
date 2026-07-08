import type { IncomingMessage, ServerResponse } from "node:http";
import { buildTodayContext, formatTodayContextMarkdown } from "../today-context.js";
import { operatorPolicyExcerpt } from "../../operator-policy.js";
import { runOperatorAsk, runOperatorAskStream } from "../../operator-runtime/ask.js";
import { loadQueueEvents } from "../../queue-db.js";
import { getTenantId } from "../../tenant.js";
import { chatMessageRequestSchema } from "../../../../schemas/steward-chat.js";
import {
  appendChatTurn,
  historyForOperator,
  loadChatThread,
  threadIdFromSessionToken,
} from "../chat-thread.js";
import { approveFromStewardChat, flushWireDeliveryFromChat } from "../wire-approve.js";
import {
  flushWitnessPendingFromChat,
  registerWitnessFromChat,
  verifyWitnessFromChat,
} from "../wire-witness.js";
import { sessionTokenFromRequest } from "../../wire-console/auth/session.js";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit, auditChatMessage } from "../audit.js";
import { buildOperatorStats } from "../operator-stats.js";

export interface ChatApiContext {
  user: WireConsoleUser;
  sessionToken?: string;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sseWrite(res: ServerResponse, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function resolveThreadId(ctx: ChatApiContext): string {
  return threadIdFromSessionToken(ctx.sessionToken);
}

function buildChatSystem(threadId: string) {
  const ctx = buildTodayContext();
  const thread = loadChatThread(threadId, getTenantId());
  const historyBlock =
    thread.messages.length > 0
      ? ["", "## Conversation history (recent)", formatHistoryMarkdown(thread)].join("\n")
      : "";
  return {
    ctx,
    thread,
    history: historyForOperator(thread),
    system: [
      operatorPolicyExcerpt(35),
      "",
      "## Today context",
      formatTodayContextMarkdown(ctx),
      historyBlock,
    ].join("\n"),
  };
}

function formatHistoryMarkdown(thread: ReturnType<typeof loadChatThread>): string {
  return thread.messages
    .map((m) => `- **${m.role}**: ${m.content.slice(0, 500)}`)
    .join("\n");
}

async function handleChatMessage(
  parsed: { message: string },
  res: ServerResponse,
  stream: boolean,
  ctx: ChatApiContext
): Promise<boolean> {
  const threadId = resolveThreadId(ctx);
  const { system, history } = buildChatSystem(threadId);

  if (!stream) {
    const result = await runOperatorAsk(parsed.message, system, { history });
    if (result.ok && result.reply) {
      appendChatTurn(threadId, getTenantId(), parsed.message, result.reply);
    }
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: result.ok,
      path: "/chat/v1/message",
      detail: auditChatMessage(parsed.message),
    });
    json(res, 200, {
      ok: result.ok,
      reply: result.reply,
      runtime: result.runtime,
      model: result.model,
      setup_required: result.setup_required,
      structured: result.structured,
      telemetry: result.telemetry,
      thread_id: threadId,
      stdout: result.stdout.slice(0, 4000),
      stderr: result.stderr.slice(0, 2000),
    });
    return true;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  sseWrite(res, { type: "connected", thread_id: threadId });

  try {
    const gen = runOperatorAskStream(parsed.message, system, { history });
    let step = await gen.next();
    while (!step.done) {
      sseWrite(res, step.value);
      step = await gen.next();
    }
    const result = step.value;
    if (result.ok && result.reply) {
      appendChatTurn(threadId, getTenantId(), parsed.message, result.reply);
    }
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: result.ok,
      path: "/chat/v1/message/stream",
      detail: auditChatMessage(parsed.message),
    });
    sseWrite(res, {
      type: "done",
      ok: result.ok,
      reply: result.reply,
      runtime: result.runtime,
      model: result.model,
      setup_required: result.setup_required,
      structured: result.structured,
      telemetry: result.telemetry,
      thread_id: threadId,
    });
  } catch (err) {
    appendChatAudit({
      action: "message",
      operator_id: ctx.user.operator_id,
      approver_id: ctx.user.approver_id,
      ok: false,
      path: "/chat/v1/message/stream",
      detail: err instanceof Error ? err.message : String(err),
    });
    sseWrite(res, {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  res.end();
  return true;
}

export async function handleChatApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  ctx: ChatApiContext
): Promise<boolean> {
  if (pathname === "/chat/v1/today" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    json(res, 200, today);
    return true;
  }

  if (pathname === "/chat/v1/today.md" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
    res.end(formatTodayContextMarkdown(today));
    return true;
  }

  if (pathname === "/chat/v1/operator/stats" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    json(res, 200, { ok: true, ...buildOperatorStats() });
    return true;
  }

  if (pathname === "/chat/v1/approvals" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    const today = buildTodayContext();
    json(res, 200, { approvals: today.approvals });
    return true;
  }

  const approveMatch = pathname.match(/^\/chat\/v1\/approvals\/([^/]+)\/approve$/);
  if (approveMatch && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:approve", res)) return true;
    const approvalId = decodeURIComponent(approveMatch[1]!);
    const body = await readBody(req);
    let flush = true;
    try {
      const parsed = JSON.parse(body || "{}") as { flush?: boolean };
      if (parsed.flush === false) flush = false;
    } catch {
      /* default flush */
    }
    try {
      const result = await approveFromStewardChat(approvalId, ctx.user, { flush });
      appendChatAudit({
        action: "approve",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: approvalId,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "approve",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/flush" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    try {
      const result = await flushWireDeliveryFromChat();
      appendChatAudit({
        action: "wire_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "wire_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/register" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as { event_id?: string; side?: string };
      if (!parsed.event_id || (parsed.side !== "sent" && parsed.side !== "received")) {
        json(res, 422, { ok: false, error: "event_id and side (sent|received) required" });
        return true;
      }
      const result = await registerWitnessFromChat(parsed.event_id, parsed.side);
      appendChatAudit({
        action: "witness_register",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: parsed.event_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_register",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/verify" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    const body = await readBody(req);
    try {
      const parsed = JSON.parse(body || "{}") as { event_id?: string };
      if (!parsed.event_id) {
        json(res, 422, { ok: false, error: "event_id required" });
        return true;
      }
      const result = await verifyWitnessFromChat(parsed.event_id);
      appendChatAudit({
        action: "witness_verify",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
        detail: parsed.event_id,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_verify",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/wire/witness/flush" && method === "POST") {
    if (!requireChatPermission(ctx.user, "chat:wire", res)) return true;
    try {
      const result = await flushWitnessPendingFromChat();
      appendChatAudit({
        action: "witness_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(res, 200, { ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "witness_flush",
        operator_id: ctx.user.operator_id,
        approver_id: ctx.user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (
    (pathname === "/chat/v1/message" && method === "POST") ||
    (pathname === "/chat/v1/message/stream" && method === "POST")
  ) {
    if (!requireChatPermission(ctx.user, "chat:ask", res)) return true;
    const raw = await readBody(req);
    let parsed: { message: string; refresh?: boolean };
    try {
      parsed = chatMessageRequestSchema.parse(JSON.parse(raw));
    } catch {
      json(res, 400, { error: "invalid body" });
      return true;
    }

    const stream = pathname.endsWith("/stream");
    return handleChatMessage(parsed, res, stream, ctx);
  }

  if (pathname === "/chat/v1/events/stream" && method === "GET") {
    if (!requireChatPermission(ctx.user, "chat:read", res)) return true;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const recent = loadQueueEvents().filter((e) => e.type === "pipeline_daily_complete").slice(-1);
    if (recent[0]) {
      res.write(`data: ${JSON.stringify({ type: "pipeline_daily_complete", event: recent[0] })}\n\n`);
    }

    const interval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 30000);

    req.on("close", () => clearInterval(interval));
    return true;
  }

  return false;
}
