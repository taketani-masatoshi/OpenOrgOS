import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { requireChatPermission } from "../../console-auth/rbac.js";
import { appendChatAudit } from "../audit.js";
import {
  InvalidJsonError,
  PayloadTooLargeError,
  readJsonLimited,
} from "../../http/read-json-limited.js";
import {
  applyWorkflowStructureChangeProposal,
  evaluateWorkflowDocument,
  evaluateWorkflowDocumentWithOptionalLlm,
  listWorkflowDocuments,
  listWorkflowStructureChangeProposals,
  loadWorkflowDocument,
  loadWorkflowStructureChangeProposal,
  proposeWorkflowStructureChange,
} from "../../workflow-canvas/index.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function errorStatus(err: unknown): number {
  return err instanceof InvalidJsonError || err instanceof PayloadTooLargeError ? 400 : 422;
}

/**
 * GET  /chat/v1/workflow — list SSOT workflows
 * GET  /chat/v1/workflow/:id — one SSOT workflow
 * POST /chat/v1/workflow/evaluate — deterministic evaluate (no write)
 * GET  /chat/v1/workflow/change — stored WFS proposals
 * POST /chat/v1/workflow/change/propose — record proposal (chat:ask)
 * POST /chat/v1/workflow/change/validate — dry-run apply
 * POST /chat/v1/workflow/change/apply — apply approved proposal (chat:approve)
 */
export async function handleWorkflowApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  user: WireConsoleUser,
): Promise<boolean> {
  if (pathname === "/chat/v1/workflow" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, documents: listWorkflowDocuments() });
    return true;
  }

  if (pathname === "/chat/v1/workflow/evaluate" && method === "POST") {
    if (!requireChatPermission(user, "chat:ask", res)) return true;
    try {
      const body = (await readJsonLimited(req)) as {
        document?: unknown;
        llm_proposal?: unknown;
      };
      if (body.document === undefined) {
        json(res, 422, { ok: false, error: "document is required" });
        return true;
      }
      const result =
        body.llm_proposal === undefined
          ? { ...evaluateWorkflowDocument(body.document), used_llm: false }
          : evaluateWorkflowDocumentWithOptionalLlm(body.document, {
              llm_proposal: body.llm_proposal,
            });
      json(res, 200, { ok: result.ok, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, errorStatus(err), { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/workflow/change" && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    json(res, 200, { ok: true, proposals: listWorkflowStructureChangeProposals() });
    return true;
  }

  if (pathname === "/chat/v1/workflow/change/propose" && method === "POST") {
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
      const proposal = proposeWorkflowStructureChange({
        input: body.change,
        approvalId: body.approval_id.trim(),
        proposedBy: user.operator_id,
      });
      appendChatAudit({
        action: "workflow_structure_propose",
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

  const isValidate = pathname === "/chat/v1/workflow/change/validate";
  const isApply = pathname === "/chat/v1/workflow/change/apply";
  if ((isValidate || isApply) && method === "POST") {
    const permission = isApply ? "chat:approve" : "chat:read";
    if (!requireChatPermission(user, permission, res)) return true;
    try {
      const body = (await readJsonLimited(req)) as { change_id?: string };
      if (!body.change_id?.trim()) {
        json(res, 422, { ok: false, error: "change_id is required" });
        return true;
      }
      const proposal = loadWorkflowStructureChangeProposal(body.change_id.trim());
      const result = applyWorkflowStructureChangeProposal({
        proposal,
        appliedBy: user.operator_id,
        dryRun: isValidate,
      });
      if (isApply) {
        appendChatAudit({
          action: "workflow_structure_apply",
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
          action: "workflow_structure_apply",
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

  const getMatch = pathname.match(/^\/chat\/v1\/workflow\/([^/]+)$/);
  if (getMatch && method === "GET") {
    if (!requireChatPermission(user, "chat:read", res)) return true;
    const id = decodeURIComponent(getMatch[1]!);
    if (id === "change" || id === "evaluate") {
      return false;
    }
    const document = loadWorkflowDocument(id);
    if (!document) {
      json(res, 404, { ok: false, error: `workflow not found: ${id}` });
      return true;
    }
    json(res, 200, { ok: true, document });
    return true;
  }

  return false;
}
