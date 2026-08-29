import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  executeTowerAssign,
  loadTowerPlan,
  saveTowerPlan,
} from "../../dispatch-tower/assign.js";
import {
  buildTowerInventory,
  formatTowerInventoryMarkdown,
} from "../../dispatch-tower/inventory.js";
import { classifyWork } from "../../dispatch-tower/classify.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function formatRouteError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

const classifyBodySchema = z.object({
  text: z.string().min(1),
});

const assignBodySchema = z.object({
  plan_id: z.string().min(1),
  confirmed: z.boolean().optional(),
  assignee_employee_id: z.string().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function handleTowerApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/tower")) return false;

  if (pathname === "/chat/v1/tower/inventory" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const inventory = buildTowerInventory();
    json(res, 200, {
      ok: true,
      inventory,
      markdown: formatTowerInventoryMarkdown(inventory),
    });
    return true;
  }

  if (pathname === "/chat/v1/tower/classify" && method === "POST") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      const body = classifyBodySchema.parse(await readJsonLimited(req));
      const classification = classifyWork(body.text);
      json(res, 200, { ok: true, classification });
    } catch (err) {
      if (err instanceof InvalidJsonError || err instanceof PayloadTooLargeError) {
        json(res, err.statusCode, { ok: false, error: err.message });
        return true;
      }
      json(res, 400, { ok: false, error: formatRouteError(err) });
    }
    return true;
  }

  if (pathname === "/chat/v1/tower/assign" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = assignBodySchema.parse(await readJsonLimited(req));
      if (!body.confirmed) {
        json(res, 400, { ok: false, error: "confirmed=true required" });
        return true;
      }
      const plan = loadTowerPlan(body.plan_id);
      if (!plan) {
        json(res, 404, { ok: false, error: "tower plan not found or expired" });
        return true;
      }
      const result = executeTowerAssign(plan, {
        assignee_employee_id: body.assignee_employee_id,
        due_date: body.due_date,
      });
      if (!result.ok) {
        json(res, 400, { ok: false, error: result.error ?? "assign failed" });
        return true;
      }
      if (result.plan) saveTowerPlan(result.plan);
      json(res, 200, {
        ok: true,
        plan: result.plan,
        work_order_ids: result.work_order_ids,
      });
    } catch (err) {
      if (err instanceof InvalidJsonError || err instanceof PayloadTooLargeError) {
        json(res, err.statusCode, { ok: false, error: err.message });
        return true;
      }
      json(res, 400, { ok: false, error: formatRouteError(err) });
    }
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
