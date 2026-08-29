import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import {
  hasChatPermission,
  requireChatPermission,
} from "../../console-auth/rbac.js";
import {
  isOperatorAuthBypassed,
  isOperatorAuthRequired,
  operatorHasPermission,
  resolveOperatorFromSessionUser,
} from "../../console-auth/operator-rbac.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import { setTenantAgentEnabled } from "../../agent-roster.js";
import { isModuleInstalled } from "../../module-import.js";
import { proposeTenantConfigChange } from "../../org/tenant-config-change.js";
import { appendChatAudit } from "../audit.js";
import { buildAgentModuleInventory } from "../agent-module-inventory.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const enabledBodySchema = z.object({
  enabled: z.boolean(),
});

const importBodySchema = z.object({
  id: z.string().min(1).max(80),
});

export function canMutateAgentRoster(user: WireConsoleUser): boolean {
  if (!hasChatPermission(user, "chat:ask")) return false;
  if (isOperatorAuthBypassed() || !isOperatorAuthRequired()) return true;
  return operatorHasPermission(resolveOperatorFromSessionUser(user), "agent:order");
}

export function canProposeModuleChange(user: WireConsoleUser): boolean {
  return hasChatPermission(user, "chat:ask");
}

function requireRosterMutation(
  user: WireConsoleUser,
  res: ServerResponse
): boolean {
  if (!requireChatPermission(user, "chat:ask", res)) return false;
  if (canMutateAgentRoster(user)) return true;
  json(res, 403, { ok: false, error: "forbidden", permission: "agent:order" });
  return false;
}

function requireProposePermission(user: WireConsoleUser, res: ServerResponse): boolean {
  if (!requireChatPermission(user, "chat:ask", res)) return false;
  if (canProposeModuleChange(user)) return true;
  json(res, 403, { ok: false, error: "forbidden", permission: "chat:ask" });
  return false;
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

function proposedBy(user: WireConsoleUser): string {
  return user.operator_id?.trim() || user.approver_id?.trim() || "operator";
}

/**
 * Agent use-toggles and module import / on-off (propose).
 * Prefix: /chat/v1/agent-modules
 */
export async function handleAgentModulesApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/agent-modules")) return false;

  if (pathname === "/chat/v1/agent-modules" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    try {
      json(res, 200, {
        ok: true,
        can_mutate: canMutateAgentRoster(user),
        can_propose: canProposeModuleChange(user),
        ...buildAgentModuleInventory(),
      });
    } catch (error) {
      json(res, 500, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  const agentMatch = pathname.match(/^\/chat\/v1\/agent-modules\/agents\/([^/]+)\/enabled$/);
  if (agentMatch && method === "POST") {
    try {
      const body = enabledBodySchema.parse(await readJsonLimited(req));
      const id = decodeURIComponent(agentMatch[1] ?? "");

      if (body.enabled) {
        if (!requireProposePermission(user, res)) return true;
        const proposed = proposeTenantConfigChange({
          target: "agents",
          targetId: id,
          enabled: true,
          proposedBy: proposedBy(user),
        });
        appendChatAudit({
          action: "message",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: true,
          path: pathname,
          detail: `agent-propose:${id}:true:${proposed.approval_id}`,
        });
        json(res, 200, {
          ok: true,
          proposed: true,
          change_id: proposed.change.change_id,
          approval_id: proposed.approval_id,
          can_mutate: canMutateAgentRoster(user),
          can_propose: true,
          ...buildAgentModuleInventory(),
        });
      } else {
        if (!requireRosterMutation(user, res)) return true;
        setTenantAgentEnabled(id, false);
        appendChatAudit({
          action: "message",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: true,
          path: pathname,
          detail: `agent-toggle:${id}:false`,
        });
        json(res, 200, {
          ok: true,
          can_mutate: true,
          can_propose: canProposeModuleChange(user),
          ...buildAgentModuleInventory(),
        });
      }
    } catch (error) {
      const status =
        error instanceof InvalidJsonError || error instanceof z.ZodError
          ? 400
          : error instanceof PayloadTooLargeError
            ? 413
            : 400;
      json(res, status, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  if (pathname === "/chat/v1/agent-modules/modules/import" && method === "POST") {
    if (!requireProposePermission(user, res)) return true;
    try {
      const body = importBodySchema.parse(await readJsonLimited(req));
      const proposed = proposeTenantConfigChange({
        target: "modules",
        targetId: body.id,
        enabled: true,
        action: "import_enable",
        proposedBy: proposedBy(user),
      });
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `module-import-propose:${body.id}:${proposed.approval_id}`,
      });
      json(res, 200, {
        ok: true,
        proposed: true,
        change_id: proposed.change.change_id,
        approval_id: proposed.approval_id,
        can_mutate: canMutateAgentRoster(user),
        can_propose: true,
        ...buildAgentModuleInventory(),
      });
    } catch (error) {
      const status =
        error instanceof InvalidJsonError || error instanceof z.ZodError
          ? 400
          : error instanceof PayloadTooLargeError
            ? 413
            : 400;
      json(res, status, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  const moduleMatch = pathname.match(/^\/chat\/v1\/agent-modules\/modules\/([^/]+)\/enabled$/);
  if (moduleMatch && method === "POST") {
    if (!requireProposePermission(user, res)) return true;
    try {
      const body = enabledBodySchema.parse(await readJsonLimited(req));
      const id = decodeURIComponent(moduleMatch[1] ?? "");
      if (!isModuleInstalled(id)) {
        json(res, 400, {
          ok: false,
          error: `Module ${id} is not imported yet`,
        });
        return true;
      }
      const proposed = proposeTenantConfigChange({
        target: "modules",
        targetId: id,
        enabled: body.enabled,
        proposedBy: proposedBy(user),
      });
      appendChatAudit({
        action: "message",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: `module-propose:${id}:${body.enabled}:${proposed.approval_id}`,
      });
      json(res, 200, {
        ok: true,
        proposed: true,
        change_id: proposed.change.change_id,
        approval_id: proposed.approval_id,
        can_mutate: canMutateAgentRoster(user),
        can_propose: true,
        ...buildAgentModuleInventory(),
      });
    } catch (error) {
      const status =
        error instanceof InvalidJsonError || error instanceof z.ZodError
          ? 400
          : error instanceof PayloadTooLargeError
            ? 413
            : 400;
      json(res, status, { ok: false, error: formatRouteError(error) });
    }
    return true;
  }

  return false;
}
