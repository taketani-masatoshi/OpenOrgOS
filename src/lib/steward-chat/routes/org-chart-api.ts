import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { buildOrgChartApiPayload } from "../org-chart-view.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  applyOrgChartChangeProposal,
  listOrgChartChangeProposals,
  loadOrgChartChangeProposal,
  proposeOrgChartChange,
} from "../../org/org-chart-change.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorStatus(err: unknown): number {
  return err instanceof InvalidJsonError || err instanceof PayloadTooLargeError ? 400 : 422;
}

/**
 * GET  /chat/v1/org/chart — deterministic L1 org chart for Operator Console.
 * GET  /chat/v1/org/chart/change — stored OCH proposals.
 * POST /chat/v1/org/chart/change/propose — record proposal (chat:ask).
 * POST /chat/v1/org/chart/change/validate — dry-run apply, returns before/after hashes.
 * POST /chat/v1/org/chart/change/apply — apply approved proposal (chat:approve).
 */
export async function handleOrgChartApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser
): Promise<boolean> {
  if (pathname === "/chat/v1/org/chart" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const asOf = new URL(req.url ?? "/", "http://localhost").searchParams.get("as_of")?.trim();
    json(res, 200, buildOrgChartApiPayload({ asOf: asOf || undefined }));
    return true;
  }

  if (pathname === "/chat/v1/org/chart/change" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, proposals: listOrgChartChangeProposals() });
    return true;
  }

  if (pathname === "/chat/v1/org/chart/change/propose" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        approval_id?: string;
        change?: unknown;
      };
      if (!body.approval_id?.trim()) {
        json(res, 422, { ok: false, error: "approval_id is required" });
        return true;
      }
      const proposal = proposeOrgChartChange({
        input: body.change,
        approvalId: body.approval_id.trim(),
        proposedBy: user.operator_id,
      });
      appendChatAudit({
        action: "org_chart_change_propose",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: proposal.change_id,
      });
      json(res, 200, { ok: true, proposal });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  // @ooo-route POST /chat/v1/org/chart/change/validate
  // @ooo-route POST /chat/v1/org/chart/change/apply
  const isValidate = pathname === "/chat/v1/org/chart/change/validate";
  const isApply = pathname === "/chat/v1/org/chart/change/apply";
  if ((isValidate || isApply) && method === "POST") {
    const permission = isApply ? "chat:approve" : "chat:read";
    if (!requireChatPermission(user, permission, res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { change_id?: string };
      if (!body.change_id?.trim()) {
        json(res, 422, { ok: false, error: "change_id is required" });
        return true;
      }
      const proposal = loadOrgChartChangeProposal(body.change_id.trim());
      const result = applyOrgChartChangeProposal({
        proposal,
        appliedBy: user.operator_id,
        dryRun: isValidate,
      });
      if (isApply) {
        appendChatAudit({
          action: "org_chart_change_apply",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: true,
          path: pathname,
          detail: proposal.change_id,
        });
      }
      json(res, 200, { ok: true, proposal, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isApply) {
        appendChatAudit({
          action: "org_chart_change_apply",
          operator_id: user.operator_id,
          approver_id: user.approver_id,
          ok: false,
          path: pathname,
          detail: message,
        });
      }
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  return false;
}
