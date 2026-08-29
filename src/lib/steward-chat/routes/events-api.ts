/**
 * Company events BFF for Executive Home.
 * Path: src/lib/steward-chat/routes/events-api.ts
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireWireConsolePermission } from "../../console-auth/operator-rbac.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  archiveCompanyEvent,
  closeCompanyEvent,
  createCompanyEvent,
  findCompanyEventById,
  listCompanyEvents,
  parseMonth,
  voidCompanyEvent,
} from "../../company-events.js";
import { assertCanVoidCompanyEvent } from "../../company-events-wire.js";
import { buildCompanyEventChainReport } from "../../company-events-chain-report.js";
import { companyEventKind } from "../../../../schemas/company-events.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const createBodySchema = z.object({
  kind: companyEventKind,
  title: z.string().min(1),
  occurred_at: z.string().optional(),
  notes: z.string().optional(),
});

const voidBodySchema = z.object({
  reason: z.string().min(1),
});

export async function handleEventsApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/events/open" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
    const monthParam = query.get("month")?.trim();
    const statusFilter = query.get("status")?.trim();
    const includeVoided = query.get("include_voided") === "1";
    const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : parseMonth();
    const events = listCompanyEvents({ month, includeVoided }).filter((e) => {
      if (statusFilter) return e.status === statusFilter;
      return includeVoided || (e.status !== "closed" && e.status !== "voided");
    });
    json(res, 200, {
      ok: true,
      month,
      events: events.slice(0, 30).map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        status: e.status,
        occurred_at: e.occurred_at,
      })),
    });
    return true;
  }

  if (pathname === "/chat/v1/events" && method === "POST") {
    if (!requireWireConsolePermission(user, "events:write", res)) return true;
    try {
      const body = createBodySchema.parse(await readJsonLimited(req));
      const event = createCompanyEvent({
        kind: body.kind,
        title: body.title,
        occurredAt: body.occurred_at,
        notes: body.notes,
      });
      appendChatAudit({
        action: "events_create",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: event.id,
      });
      json(res, 200, {
        ok: true,
        event: {
          id: event.id,
          kind: event.kind,
          title: event.title,
          status: event.status,
          occurred_at: event.occurred_at,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: "events_create",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      const status =
        err instanceof InvalidJsonError || err instanceof PayloadTooLargeError
          ? 400
          : err instanceof z.ZodError
            ? 422
            : 400;
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/events/chain/verify" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, report: buildCompanyEventChainReport() });
    return true;
  }

  const lifecycle = /^\/chat\/v1\/events\/([^/]+)\/(close|archive|void)$/.exec(pathname);
  if (lifecycle && method === "POST") {
    if (!requireWireConsolePermission(user, "events:write", res)) return true;
    const eventId = decodeURIComponent(lifecycle[1] ?? "");
    const action = lifecycle[2] as "close" | "archive" | "void";
    const auditAction =
      action === "close"
        ? "events_close"
        : action === "archive"
          ? "events_archive"
          : "events_void";
    try {
      const existing = findCompanyEventById(eventId);
      if (!existing) {
        json(res, 404, { ok: false, error: `event not found: ${eventId}` });
        return true;
      }
      let detail = eventId;
      if (action === "void") {
        const body = voidBodySchema.parse(await readJsonLimited(req));
        assertCanVoidCompanyEvent(existing);
        voidCompanyEvent(eventId, body.reason);
        detail = `${eventId}: ${body.reason}`;
      } else if (action === "close") {
        closeCompanyEvent(eventId);
      } else {
        archiveCompanyEvent(eventId);
      }
      appendChatAudit({
        action: auditAction,
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail,
      });
      const updated = findCompanyEventById(eventId);
      json(res, 200, {
        ok: true,
        event: updated && {
          id: updated.id,
          kind: updated.kind,
          title: updated.title,
          status: updated.status,
          occurred_at: updated.occurred_at,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendChatAudit({
        action: auditAction,
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: false,
        path: pathname,
        detail: message,
      });
      const status =
        err instanceof InvalidJsonError || err instanceof PayloadTooLargeError
          ? 400
          : 422;
      json(res, status, { ok: false, error: message });
    }
    return true;
  }

  return false;
}
