import type { IncomingMessage, ServerResponse } from "node:http";
import type { NoticeWireType } from "../../../../schemas/protocol/pending-notice.js";
import { SettlementStepUpRequiredError } from "../../org/settlement-stepup.js";
import { settlementStepUpResponse } from "../../steward-chat/routes/settlement-api.js";
import { getSessionUser, sessionTokenFromRequest } from "../auth/session.js";
import type { WireConsoleUser } from "../auth/session.js";
import {
  requireWireConsolePermission,
  wirePermissionForAction,
} from "../../console-auth/operator-rbac.js";
import { listWireConsoleTenants } from "../tenant-registry.js";
import {
  approveTenantNotice,
  deliverTenantEnvelope,
  flushTenantWitnessPending,
  flushTenantWirePending,
  proposeTenantNotice,
  registerTenantWitness,
  rejectTenantNotice,
  verifyTenantWitness,
} from "../tenant-actions.js";
import {
  getTenantApprovals,
  getTenantDelivery,
  getTenantEventDetail,
  getTenantEventWorkflow,
  getTenantInbox,
  getTenantLedger,
  getTenantOutbox,
  getTenantPeers,
  getTenantSnapshot,
  getTenantWitnessStatus,
  getTenantWireConsoleScenario,
} from "../tenant-data.js";
import {
  getTenantMailMessageBody,
  getTenantMailMessages,
  getTenantMailThreads,
  type MailFolder,
} from "../human-mail.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function requireUser(req: IncomingMessage, res: ServerResponse) {
  const user = getSessionUser(sessionTokenFromRequest(req));
  if (!user) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return undefined;
  }
  return user;
}

function actionErrorStatus(message: string): number {
  if (message.includes("not found") || message.includes("Unknown tenant")) return 404;
  if (
    message.includes("not authorized") ||
    message.includes("Approver") ||
    message.includes("expected pending_approval")
  ) {
    return 403;
  }
  if (
    message.includes("required") ||
    message.includes("must be") ||
    message.includes("Invalid") ||
    message.includes("disabled")
  ) {
    return 422;
  }
  return 500;
}

/**
 * Tenant-scoped routes are matched by splitting the path into a tenant id and a
 * trailing section, so the route catalog needs the base to rebuild full paths.
 *
 * @ooo-route-section-base /console/v1/tenants/:tenant
 */
const TENANT_BASE = /^\/console\/v1\/tenants\/([a-z0-9_-]+)(?:\/(.*))?\/?$/;

export async function handleConsoleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  searchParams: URLSearchParams
): Promise<boolean> {
  if (method === "GET" && pathname === "/console/v1/tenants") {
    if (!requireUser(req, res)) return true;
    json(res, 200, { ok: true, tenants: listWireConsoleTenants() });
    return true;
  }

  const match = pathname.match(TENANT_BASE);
  if (!match) return false;

  const tenantId = match[1]!;
  const section = match[2] ?? "";

  if (method === "GET") {
    const user = requireUser(req, res);
    if (!user) return true;
    try {
      return handleTenantGet(req, res, tenantId, section, searchParams, user);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status =
        message.includes("wire_console") || message.includes("Unknown tenant") ? 404 : 500;
      json(res, status, { ok: false, error: message });
      return true;
    }
  }

  if (method === "POST") {
    const user = requireUser(req, res);
    if (!user) return true;
    try {
      const body = await parseJsonBody(req);
      return await handleTenantPost(req, res, tenantId, section, body, user);
    } catch (e) {
      if (e instanceof SettlementStepUpRequiredError) {
        json(res, 409, settlementStepUpResponse(e));
        return true;
      }
      const message = e instanceof Error ? e.message : String(e);
      json(res, actionErrorStatus(message), { ok: false, error: message });
      return true;
    }
  }

  return false;
}

function handleTenantGet(
  _req: IncomingMessage,
  res: ServerResponse,
  tenantId: string,
  section: string,
  searchParams: URLSearchParams,
  user: WireConsoleUser
): boolean {
  if (!section) {
    json(res, 200, { ok: true, tenant_id: tenantId });
    return true;
  }

  if (section.startsWith("events/")) {
    const rest = section.slice("events/".length);
    if (rest.endsWith("/workflow")) {
      const eventId = rest.slice(0, -"/workflow".length);
      const workflow = getTenantEventWorkflow(tenantId, eventId);
      json(res, 200, { ok: true, ...workflow });
      return true;
    }
    const detail = getTenantEventDetail(tenantId, rest);
    if (!detail) {
      json(res, 404, { ok: false, error: "event not found" });
      return true;
    }
    json(res, 200, { ok: true, ...detail });
    return true;
  }

  if (section === "snapshot") {
    json(res, 200, { ok: true, ...getTenantSnapshot(tenantId) });
    return true;
  }

  if (section === "scenario") {
    const scenario = getTenantWireConsoleScenario(tenantId);
    if (!scenario) {
      json(res, 404, { ok: false, error: "scenario not found" });
      return true;
    }
    json(res, 200, { ok: true, scenario });
    return true;
  }

  if (section === "outbox") {
    const limit = searchParams.get("limit");
    json(res, 200, {
      ok: true,
      entries: getTenantOutbox(tenantId, limit ? Number(limit) : undefined),
    });
    return true;
  }

  if (section === "inbox") {
    const limit = searchParams.get("limit");
    json(res, 200, {
      ok: true,
      entries: getTenantInbox(tenantId, limit ? Number(limit) : undefined),
    });
    return true;
  }

  if (section === "ledger") {
    json(res, 200, { ok: true, transactions: getTenantLedger(tenantId) });
    return true;
  }

  if (section === "peers") {
    json(res, 200, { ok: true, peers: getTenantPeers(tenantId) });
    return true;
  }

  if (section === "approvals") {
    const scope = searchParams.get("scope") as "wire" | "internal" | null;
    json(res, 200, {
      ok: true,
      approvals: getTenantApprovals(tenantId, scope ?? "wire"),
    });
    return true;
  }

  if (section === "delivery") {
    json(res, 200, { ok: true, ...getTenantDelivery(tenantId) });
    return true;
  }

  if (section === "witness/status") {
    json(res, 200, { ok: true, ...getTenantWitnessStatus(tenantId) });
    return true;
  }

  if (section === "messages") {
    const folder = (searchParams.get("folder") ?? "all") as MailFolder;
    json(res, 200, { ok: true, messages: getTenantMailMessages(tenantId, folder) });
    return true;
  }

  if (section.startsWith("messages/")) {
    const messageId = decodeURIComponent(section.slice("messages/".length));
    const body = getTenantMailMessageBody(tenantId, messageId, user.approver_id);
    if (!body) {
      json(res, 404, { ok: false, error: "message not found" });
      return true;
    }
    json(res, 200, { ok: true, ...body });
    return true;
  }

  if (section === "threads") {
    const folder = (searchParams.get("folder") ?? "all") as MailFolder;
    json(res, 200, { ok: true, threads: getTenantMailThreads(tenantId, folder) });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}

async function handleTenantPost(
  req: IncomingMessage,
  res: ServerResponse,
  tenantId: string,
  section: string,
  body: Record<string, unknown>,
  user: WireConsoleUser
): Promise<boolean> {
  const perm = wirePermissionForAction(section);
  if (!requireWireConsolePermission(user, perm, res)) return true;

  if (section === "notices/propose") {
    const peerId = body.peer_id;
    const txType = body.transaction_type;
    if (typeof peerId !== "string" || typeof txType !== "string") {
      json(res, 422, { ok: false, error: "peer_id and transaction_type required" });
      return true;
    }
    const result = await proposeTenantNotice(tenantId, user, {
      peer_id: peerId,
      transaction_type: txType as NoticeWireType,
      contract_id: typeof body.contract_id === "string" ? body.contract_id : undefined,
      correlation_event_id:
        typeof body.correlation_event_id === "string" ? body.correlation_event_id : undefined,
      invoice_id: typeof body.invoice_id === "string" ? body.invoice_id : undefined,
      broker_instruction:
        typeof body.broker_instruction === "string" ? body.broker_instruction : undefined,
      stakeholder_id: typeof body.stakeholder_id === "string" ? body.stakeholder_id : undefined,
      message: typeof body.message === "string" ? body.message : undefined,
      amount:
        body.amount &&
        typeof body.amount === "object" &&
        typeof (body.amount as { value?: unknown }).value === "number"
          ? {
              value: (body.amount as { value: number }).value,
              currency:
                typeof (body.amount as { currency?: unknown }).currency === "string"
                  ? (body.amount as { currency: string }).currency
                  : "JPY",
            }
          : undefined,
    });
    json(res, 200, { ok: true, ...result });
    return true;
  }

  const noticeMatch = section.match(/^notices\/([^/]+)\/(approve|reject)$/);
  if (noticeMatch) {
    const noticeId = noticeMatch[1]!;
    const action = noticeMatch[2]!;
    if (action === "approve") {
      const result = await approveTenantNotice(tenantId, user, noticeId, {
        co_approver_id:
          typeof body.co_approver_id === "string" ? body.co_approver_id : undefined,
        settlementAssertion:
          body.settlement &&
          typeof body.settlement === "object" &&
          body.settlement !== null &&
          typeof (body.settlement as { challenge_id?: unknown }).challenge_id === "string"
            ? (body.settlement as {
                challenge_id: string;
                token: string;
                credential_id: string;
                challenge: string;
                client_data_json: string;
                authenticator_data_base64?: string;
                signature_base64?: string;
              })
            : undefined,
      });
      json(res, 200, { ok: true, ...result });
      return true;
    }
    const result = await rejectTenantNotice(
      tenantId,
      user,
      noticeId,
      typeof body.reason === "string" ? body.reason : undefined
    );
    json(res, 200, { ok: true, ...result });
    return true;
  }

  if (section === "delivery/deliver") {
    const peerId = body.peer_id;
    const eventId = body.event_id;
    if (typeof peerId !== "string" || typeof eventId !== "string") {
      json(res, 422, { ok: false, error: "peer_id and event_id required" });
      return true;
    }
    const result = await deliverTenantEnvelope(tenantId, peerId, eventId);
    json(res, 200, { ok: true, ...result });
    return true;
  }

  if (section === "delivery/flush-pending") {
    const result = await flushTenantWirePending(tenantId);
    json(res, 200, { ok: true, ...result });
    return true;
  }

  if (section === "witness/register") {
    const eventId = body.event_id;
    const side = body.side;
    if (typeof eventId !== "string" || (side !== "sent" && side !== "received")) {
      json(res, 422, { ok: false, error: "event_id and side (sent|received) required" });
      return true;
    }
    const result = await registerTenantWitness(tenantId, eventId, side);
    json(res, 200, { ok: true, ...result });
    return true;
  }

  if (section === "witness/flush-pending") {
    const result = await flushTenantWitnessPending(tenantId);
    json(res, 200, { ok: true, ...result });
    return true;
  }

  if (section === "witness/verify") {
    const eventId = body.event_id;
    if (typeof eventId !== "string") {
      json(res, 422, { ok: false, error: "event_id required" });
      return true;
    }
    const result = await verifyTenantWitness(tenantId, eventId);
    json(res, 200, { ok: true, ...result });
    return true;
  }

  json(res, 404, { ok: false, error: "not found" });
  return true;
}
