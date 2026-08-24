import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  resolveOperatorFromSessionUser,
  resolveOperatorPermissions,
} from "../../console-auth/operator-rbac.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  executeCommandPlan,
  handleChatCommandMessage,
  listCommandCatalog,
  loadCommandPlan,
  refreshPlanArgs,
  resolveCommandPlan,
  saveCommandPlan,
} from "../../operator-commands/index.js";
import { appendChatAudit } from "../audit.js";

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

function sessionPermissions(user: WireConsoleUser) {
  const record = resolveOperatorFromSessionUser(user);
  if (record) return resolveOperatorPermissions(record);
  return undefined;
}

const previewBodySchema = z.object({
  message: z.string().min(1),
  skill_id: z.string().optional(),
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const runBodySchema = z.object({
  args: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  confirmed: z.boolean().optional(),
});

export async function handleCommandApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/commands")) return false;

  if (pathname === "/chat/v1/commands" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const permissions = sessionPermissions(user);
    json(res, 200, { ok: true, commands: listCommandCatalog(permissions) });
    return true;
  }

  if (pathname === "/chat/v1/commands/preview" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = previewBodySchema.parse(await readJsonLimited(req));
      const plan = resolveCommandPlan({
        message: body.message,
        skillId: body.skill_id,
        args: body.args,
        permissions: sessionPermissions(user),
      });
      if (
        plan.status === "needs_confirmation" ||
        plan.status === "needs_args" ||
        plan.status === "ambiguous" ||
        plan.status === "approval_gate"
      ) {
        saveCommandPlan(plan);
      }
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: plan.status !== "not_found" && plan.status !== "forbidden",
        path: "/chat/v1/commands/preview",
        detail: `commands:preview:${plan.status}:${plan.skill_id ?? "none"}`,
      });
      json(res, 200, { ok: true, plan });
    } catch (error) {
      const status =
        error instanceof PayloadTooLargeError
          ? 413
          : error instanceof InvalidJsonError || error instanceof z.ZodError
            ? 400
            : 500;
      json(res, status, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  const runMatch = pathname.match(/^\/chat\/v1\/commands\/([^/]+)\/run$/);
  if (runMatch && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    const planId = decodeURIComponent(runMatch[1]!);
    try {
      const body = runBodySchema.parse((await readJsonLimited(req).catch(() => ({}))) ?? {});
      let plan = loadCommandPlan(planId);
      if (!plan) {
        json(res, 404, { ok: false, error: `plan not found or expired: ${planId}` });
        return true;
      }
      if (body.args && Object.keys(body.args).length) {
        plan = refreshPlanArgs(plan, body.args);
        saveCommandPlan(plan);
      }
      const result = await executeCommandPlan({
        plan,
        operatorId: user.operator_id,
        permissions: sessionPermissions(user),
        confirmed: body.confirmed !== false,
      });
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: result.ok,
        path: `/chat/v1/commands/${planId}/run`,
        detail: `commands:run:${result.skill_id ?? "none"}:${result.ok ? "ok" : result.error ?? "fail"}`,
      });
      json(res, result.ok ? 200 : 400, { ok: result.ok, result, plan });
    } catch (error) {
      const status =
        error instanceof PayloadTooLargeError
          ? 413
          : error instanceof InvalidJsonError || error instanceof z.ZodError
            ? 400
            : 500;
      json(res, status, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  // Keep unused import reachable for tree-shaking edge cases in tests.
  void handleChatCommandMessage;

  return false;
}
