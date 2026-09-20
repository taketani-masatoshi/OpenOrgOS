import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { serveAnalyticsDashboard } from "../../executive-home/console-snapshot.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * GET /chat/v1/analytics/dashboard — KPI scorecard + data quality for Operator Console.
 */
export async function handleAnalyticsApi(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (pathname !== "/chat/v1/analytics/dashboard" || method !== "GET") return false;
  if (!requireChatPermission(user, "chat:read", res)) return true;
  const live =
    new URL(_req.url ?? "/", "http://local").searchParams.get("live") === "1";
  json(res, 200, serveAnalyticsDashboard({ live }));
  return true;
}
