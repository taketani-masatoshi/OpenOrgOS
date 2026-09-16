/**
 * Read-only finance ingest status for Steward Chat BFF.
 * Path: src/lib/steward-chat/routes/finance-ingest-api.ts
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { loadIngestStaging } from "../../finance/ingest/store.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function buildFinanceIngestStatusPayload(): {
  batches: number;
  rows: number;
  by_status: Record<string, number>;
  needs_review: Array<{
    row_id: string;
    source_kind: string;
    status: string;
    notes: string[];
  }>;
} {
  const staging = loadIngestStaging();
  const by_status: Record<string, number> = {};
  for (const row of staging.rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + 1;
  }
  const needs_review = staging.rows
    .filter((r) => r.status === "needs_review")
    .slice(0, 50)
    .map((r) => ({
      row_id: r.row_id,
      source_kind: r.source_kind,
      status: r.status,
      notes: r.review_notes.slice(0, 5),
    }));
  return {
    batches: staging.batches.length,
    rows: staging.rows.length,
    by_status,
    needs_review,
  };
}

export async function handleFinanceIngestApi(
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname !== "/chat/v1/finance/ingest" || method !== "GET") return false;
  if (!requireChatPermission(user, "chat:read", res)) return true;
  json(res, 200, buildFinanceIngestStatusPayload());
  return true;
}
