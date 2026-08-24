import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import {
  buildOrchestrationStatusPayload,
  cancelPendingWorkOrders,
  retryFailedWorkOrders,
} from "../../orchestration/orchestrate-actions.js";
import { listHandoffs } from "../../routing.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseQuery(url: string | undefined): URLSearchParams {
  const q = url?.includes("?") ? url.slice(url.indexOf("?")) : "";
  return new URLSearchParams(q);
}

function orchestrationErrorStatus(err: unknown): number {
  const message = err instanceof Error ? err.message : String(err);
  return /not found/i.test(message) ? 404 : 400;
}

function listPlanRoots(includeCompleted: boolean): {
  active_roots: string[];
  completed_roots: string[];
} {
  const implement = listHandoffs().filter((h) => h.task_type === "implement" && !h.parent_id);
  const active_roots = [...new Set(implement.filter((h) => h.status !== "completed").map((h) => h.id))].sort();
  const completed_roots = includeCompleted
    ? [...new Set(implement.filter((h) => h.status === "completed").map((h) => h.id))].sort()
    : [];
  return { active_roots, completed_roots };
}

/**
 * Run Board API
 * GET  /chat/v1/orchestration/runs[?include=completed]
 * GET  /chat/v1/orchestration/runs?id=<IMP-...>
 * GET  /chat/v1/orchestration/runs/stream?id=<IMP-...>
 * POST /chat/v1/orchestration/runs/retry?id=<IMP-...>   (chat:ask)
 * POST /chat/v1/orchestration/runs/cancel?id=<IMP-...>  (chat:ask)
 */
export async function handleOrchestrationApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/orchestration/runs")) return false;

  const query = parseQuery(req.url);
  const id = query.get("id")?.trim();

  if (pathname === "/chat/v1/orchestration/runs/retry" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    if (!id) {
      json(res, 400, { ok: false, error: "id query required" });
      return true;
    }
    try {
      const retried = retryFailedWorkOrders(id);
      json(res, 200, { ok: true, retried, ...buildOrchestrationStatusPayload(id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, orchestrationErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/orchestration/runs/cancel" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    if (!id) {
      json(res, 400, { ok: false, error: "id query required" });
      return true;
    }
    try {
      const cancelled = cancelPendingWorkOrders(id);
      json(res, 200, { ok: true, cancelled, ...buildOrchestrationStatusPayload(id) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, orchestrationErrorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (!requireChatPermission(user, "chat:read", res)) return true;

  if (pathname === "/chat/v1/orchestration/runs/stream" && method === "GET") {
    if (!id) {
      json(res, 400, { ok: false, error: "id query required" });
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const push = (): void => {
      try {
        const payload = buildOrchestrationStatusPayload(id);
        res.write(`data: ${JSON.stringify({ type: "orchestration_status", payload })}\n\n`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
      }
    };

    push();
    const interval = setInterval(push, 5000);
    req.on("close", () => clearInterval(interval));
    return true;
  }

  if (pathname === "/chat/v1/orchestration/runs" && method === "GET") {
    if (id) {
      try {
        json(res, 200, { ok: true, ...buildOrchestrationStatusPayload(id) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        json(res, 404, { ok: false, error: message });
      }
      return true;
    }

    const includeCompleted = query.get("include") === "completed";
    try {
      const { active_roots, completed_roots } = listPlanRoots(includeCompleted);
      json(res, 200, {
        ok: true,
        active_roots,
        completed_roots,
        count: active_roots.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: message });
    }
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
