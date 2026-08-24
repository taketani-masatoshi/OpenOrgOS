import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { buildOrchestrationStatusPayload } from "../../orchestration/orchestrate-actions.js";
import { listHandoffs } from "../../routing.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function parseQuery(url: string | undefined): URLSearchParams {
  const q = url?.includes("?") ? url.slice(url.indexOf("?")) : "";
  return new URLSearchParams(q);
}

function listActivePlanRoots(): string[] {
  try {
    const parents = listHandoffs()
      .filter((h) => h.child_ids?.length && h.status !== "completed")
      .map((h) => h.id);
    return [...new Set(parents)].sort();
  } catch {
    return [];
  }
}

/**
 * Run Board API — P2 骨格
 * GET /chat/v1/orchestration/runs?id=<IMP-...> — single plan payload
 * GET /chat/v1/orchestration/runs — active parent IMP ids
 * GET /chat/v1/orchestration/runs/stream?id=<IMP-...> — SSE status snapshots
 */
export async function handleOrchestrationApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (!pathname.startsWith("/chat/v1/orchestration/runs")) return false;
  if (!requireChatPermission(user, "chat:read", res)) return true;

  const query = parseQuery(req.url);

  if (pathname === "/chat/v1/orchestration/runs/stream" && method === "GET") {
    const id = query.get("id")?.trim();
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
    const id = query.get("id")?.trim();
    if (id) {
      try {
        json(res, 200, { ok: true, ...buildOrchestrationStatusPayload(id) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        json(res, 404, { ok: false, error: message });
      }
      return true;
    }

    const roots = listActivePlanRoots();
    json(res, 200, { ok: true, active_roots: roots, count: roots.length });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
