import type { IncomingMessage, ServerResponse } from "node:http";
import {
  agentInboxAckSchema,
  agentInboxDelegateSchema,
  agentInboxScopeSchema,
} from "../../../../schemas/steward-chat.js";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  ackAgentInboxItem,
  buildAgentInbox,
  readAgentSummaryBody,
  type AgentInboxScope,
} from "../../agent-inbox.js";
import { runEscalation } from "../../escalate.js";
import { getTenantId } from "../../tenant.js";
import { appendChatAudit } from "../audit.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseScope(raw: string | null): AgentInboxScope {
  const parsed = agentInboxScopeSchema.safeParse(raw ?? "executive_steward");
  return parsed.success ? parsed.data : "executive_steward";
}

/**
 * AgentMission / Work Order inbox for Steward & Secretary Web UI.
 * Prefix: /chat/v1/agent-inbox
 */
export async function handleAgentInboxApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/agent-inbox")) return false;

  if (pathname === "/chat/v1/agent-inbox" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const scope = parseScope(url.searchParams.get("for"));
      const snapshot = buildAgentInbox({ for: scope });
      json(res, 200, { ok: true, ...snapshot });
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }

  if (pathname === "/chat/v1/agent-inbox/summary" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.searchParams.get("path")?.trim() ?? "";
      if (!path) {
        json(res, 400, { ok: false, error: "path query required" });
        return true;
      }
      const markdown = readAgentSummaryBody(path);
      json(res, 200, { ok: true, path, markdown });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /must|not found|escape/i.test(message) ? 400 : 500;
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/agent-inbox/ack" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const raw = await readJsonLimited(req, 16 * 1024);
      const body = agentInboxAckSchema.parse(raw);
      const item = ackAgentInboxItem(body.mission_id, body.notes);
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `agent-inbox-ack:${body.mission_id}`,
      });
      json(res, 200, { ok: true, item });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload too large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid json" });
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      const status = /already|not found|Zod|mission/i.test(message) ? 400 : 500;
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: `agent-inbox-ack-failed:${message.slice(0, 120)}`,
      });
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/agent-inbox/delegate" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const raw = await readJsonLimited(req, 32 * 1024);
      const body = agentInboxDelegateSchema.parse(raw);
      const fromAgent = body.from ?? "executive_steward";
      const result = runEscalation({
        fromAgent,
        tenant: getTenantId(),
        input: {
          subject: body.subject,
          background: body.background,
          requirements: body.requirements,
          path: body.path,
          priority: body.priority,
          tenant: getTenantId(),
        },
      });

      if (result.workOrders.length === 0) {
        json(res, 422, {
          ok: false,
          error:
            "No eligible agents for this request — adjust subject/path or run escalate plan",
          plan_agents: result.plan.agents,
        });
        return true;
      }

      const workOrderIds = result.workOrders.map((w) => w.id);
      const childIds = result.workOrders
        .filter((w) => w.parent_id)
        .map((w) => ({ id: w.id, agent: w.to_agent, status: w.status }));
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `agent-inbox-delegate:${workOrderIds.join(",")}`,
      });
      json(res, 200, {
        ok: true,
        parent_id: result.parent?.id,
        work_order_ids: workOrderIds,
        work_orders: childIds.length
          ? childIds
          : result.workOrders.map((w) => ({
              id: w.id,
              agent: w.to_agent,
              status: w.status,
            })),
        agents: result.plan.agents,
        snapshot: buildAgentInbox({
          for: fromAgent === "secretary" ? "secretary" : "executive_steward",
        }),
      });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        json(res, 413, { ok: false, error: "payload too large" });
        return true;
      }
      if (error instanceof InvalidJsonError) {
        json(res, 400, { ok: false, error: "invalid json" });
        return true;
      }
      const message = error instanceof Error ? error.message : String(error);
      const status = /Zod|invalid|Required/i.test(message) ? 400 : 500;
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: `agent-inbox-delegate-failed:${message.slice(0, 120)}`,
      });
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
