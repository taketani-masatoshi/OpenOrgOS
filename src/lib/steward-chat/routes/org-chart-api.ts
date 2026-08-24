import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { buildOrgChartApiPayload } from "../org-chart-view.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * GET /chat/v1/org/chart — deterministic L1 org chart for Operator Console.
 */
export async function handleOrgChartApi(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (pathname !== "/chat/v1/org/chart" || method !== "GET") return false;
  if (!requireChatPermission(user, "chat:read", res)) return true;
  json(res, 200, buildOrgChartApiPayload());
  return true;
}
