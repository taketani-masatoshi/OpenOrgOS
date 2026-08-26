/**
 * Steward Chat settlement step-up HTTP routes (ADR 0037).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { WireConsoleUser } from "../../wire-console/auth/session.js";
import { findOrgApproval } from "../../org/approval/approve.js";
import {
  createSettlementChallenge,
  getSettlementChallengePublic,
  getSettlementChallengeStatus,
  SettlementStepUpRequiredError,
  settlementAssuranceRequired,
  verifySettlementAssertionAndConsume,
} from "../../org/settlement-stepup.js";
import { boundApproverId } from "../../org/operators.js";
import { isTenantConfigApprovalSubject } from "../../org/tenant-config-change.js";
import { approveFromStewardChat } from "../wire-approve.js";
import { appendChatAudit } from "../audit.js";
import {
  authorizeWebAuthnRegistration,
  createWebAuthnRegisterOptions,
  isSettlementRegistrationAllowed,
  resolveRegistrationHttpStatus,
  verifyWebAuthnRegistration,
} from "../../wire-console/auth/webauthn-register.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin":
      process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim() ||
      "https://approve.oorgos.org",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

function requestApiOrigin(req: IncomingMessage, hostFallback: string): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ||
    req.headers.host ||
    hostFallback;
  const scheme = proto === "https" || process.env.ORGOS_COOKIE_SECURE === "1" ? "https" : "http";
  return `${scheme}://${host}`.replace(/\/$/, "");
}

export function isSettlementPublicPath(pathname: string, method: string): boolean {
  if (pathname === "/chat/v1/settlement/challenge" && method === "POST") return true;
  if (pathname.startsWith("/chat/v1/settlement/challenge/") && method === "GET") return true;
  if (pathname === "/chat/v1/settlement/complete" && method === "POST") return true;
  return false;
}

export async function handleSettlementApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  opts: {
    user?: WireConsoleUser | null;
    readBody: (req: IncomingMessage) => Promise<string>;
    hostFallback?: string;
  }
): Promise<boolean> {
  if (method === "OPTIONS" && pathname.startsWith("/chat/v1/settlement/")) {
    json(res, 204, {});
    return true;
  }

  const url = new URL(req.url ?? "/", "http://local");

  if (pathname === "/chat/v1/settlement/challenge" && method === "POST") {
    if (!opts.user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    try {
      const raw = await opts.readBody(req);
      const body = JSON.parse(raw || "{}") as {
        approval_id?: string;
        co_approver_id?: string;
      };
      if (!body.approval_id) {
        json(res, 422, { ok: false, error: "approval_id required" });
        return true;
      }
      const approval = findOrgApproval(body.approval_id);
      if (!approval) {
        json(res, 404, { ok: false, error: "approval not found" });
        return true;
      }
      if (!settlementAssuranceRequired(approval)) {
        json(res, 400, {
          ok: false,
          error: "approval does not require settlement step-up (tier A or amount-less)",
        });
        return true;
      }
      const apiOrigin = requestApiOrigin(req, opts.hostFallback ?? "127.0.0.1");
      const created = createSettlementChallenge({
        approval,
        operatorId: opts.user.operator_id,
        approverId: boundApproverId(opts.user.operator_id, opts.user.approver_id),
        coApproverId: body.co_approver_id,
        apiOrigin,
      });
      appendChatAudit({
        action: "settlement_challenge",
        operator_id: opts.user.operator_id,
        approver_id: opts.user.approver_id,
        ok: true,
        path: pathname,
        detail: body.approval_id,
      });
      json(res, 200, {
        ok: true,
        ceremony_kind: "settlement",
        challenge_id: created.challenge.challenge_id,
        token: created.challenge.token,
        webauthn_challenge: created.challenge.webauthn_challenge,
        rp_id: created.challenge.rp_id,
        expires_at: created.challenge.expires_at,
        summary: created.challenge.summary,
        qr_url: created.qr_url,
        qr: created.qr,
        allow_credentials: created.allow_credentials,
        hints: created.hints,
      });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  const challengeGet = pathname.match(/^\/chat\/v1\/settlement\/challenge\/([^/]+)$/);
  if (challengeGet && method === "GET") {
    try {
      const challengeId = decodeURIComponent(challengeGet[1]!);
      const token = url.searchParams.get("token") ?? "";
      if (!token) {
        json(res, 422, { ok: false, error: "token query required" });
        return true;
      }
      if (url.searchParams.get("status") === "1") {
        const status = getSettlementChallengeStatus(challengeId, token);
        json(res, 200, { ok: true, ...status });
        return true;
      }
      const pub = getSettlementChallengePublic(challengeId, token);
      json(res, 200, { ok: true, ...pub });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (pathname === "/chat/v1/settlement/complete" && method === "POST") {
    try {
      const raw = await opts.readBody(req);
      const body = JSON.parse(raw || "{}") as {
        challenge_id?: string;
        token?: string;
        credential_id?: string;
        challenge?: string;
        client_data_json?: string;
        authenticator_data_base64?: string;
        signature_base64?: string;
        flush?: boolean;
        reviewed?: boolean;
      };
      if (!body.challenge_id || !body.token || !body.credential_id || !body.challenge || !body.client_data_json) {
        json(res, 422, {
          ok: false,
          error: "challenge_id, token, credential_id, challenge, client_data_json required",
        });
        return true;
      }

      const verified = verifySettlementAssertionAndConsume({
        challengeId: body.challenge_id,
        token: body.token,
        assertion: {
          credential_id: body.credential_id,
          challenge: body.challenge,
          client_data_json: body.client_data_json,
          authenticator_data_base64: body.authenticator_data_base64,
          signature_base64: body.signature_base64,
        },
      });

      const user: WireConsoleUser = {
        operator_id: verified.record.operator_id,
        approver_id: verified.record.approver_id,
        mode: "prod",
      };

      const pendingApproval = findOrgApproval(verified.record.approval_id);
      const reviewed =
        body.reviewed === true ||
        (pendingApproval != null && isTenantConfigApprovalSubject(pendingApproval.subject_type));

      const result = await approveFromStewardChat(verified.record.approval_id, user, {
        flush: body.flush !== false,
        reviewed,
        settlementAssertion: {
          challenge_id: body.challenge_id,
          token: body.token,
          credential_id: body.credential_id,
          challenge: body.challenge,
          client_data_json: body.client_data_json,
          authenticator_data_base64: body.authenticator_data_base64,
          signature_base64: body.signature_base64,
        },
        coApproverId: verified.record.co_approver_id,
      });

      appendChatAudit({
        action: "settlement_complete",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
        detail: verified.record.approval_id,
      });

      json(res, 200, {
        ok: true,
        challenge_id: body.challenge_id,
        ...result,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      appendChatAudit({
        action: "settlement_complete",
        operator_id: "settlement",
        approver_id: "settlement",
        ok: false,
        path: pathname,
        detail: message,
      });
      json(res, 400, { ok: false, error: message });
    }
    return true;
  }

  if (pathname === "/chat/v1/settlement/enroll/options" && method === "POST") {
    if (!opts.user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    if (!isSettlementRegistrationAllowed()) {
      json(res, 403, { ok: false, error: "WebAuthn registration disabled" });
      return true;
    }
    try {
      const raw = await opts.readBody(req);
      const body = JSON.parse(raw || "{}") as {
        operator_id?: string;
        approver_id?: string;
      };
      const result = createWebAuthnRegisterOptions(
        {
          operator_id: body.operator_id ?? opts.user.operator_id,
          approver_id: body.approver_id ?? opts.user.approver_id,
          purpose: "settlement",
        },
        { sessionUser: opts.user }
      );
      if ("error" in result) {
        json(res, resolveRegistrationHttpStatus(result), { ok: false, error: result.error });
        return true;
      }
      json(res, 200, { ok: true, ...result });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (pathname === "/chat/v1/settlement/enroll" && method === "POST") {
    if (!opts.user) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    if (!isSettlementRegistrationAllowed()) {
      json(res, 403, { ok: false, error: "WebAuthn registration disabled" });
      return true;
    }
    try {
      const raw = await opts.readBody(req);
      const body = JSON.parse(raw || "{}") as Parameters<typeof verifyWebAuthnRegistration>[0];
      const authorized = authorizeWebAuthnRegistration(
        {
          operator_id: body.operator_id ?? opts.user.operator_id,
          approver_id: body.approver_id ?? opts.user.approver_id,
          purpose: "settlement",
        },
        opts.user
      );
      if ("status" in authorized) {
        json(res, authorized.status, { ok: false, error: authorized.error });
        return true;
      }
      const result = verifyWebAuthnRegistration({ ...body, purpose: "settlement" });
      if ("error" in result) {
        json(res, 401, { ok: false, error: result.error });
        return true;
      }
      json(res, 200, {
        ok: true,
        credential_id: result.credential_id,
        purpose: "settlement",
      });
    } catch (e) {
      json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  return false;
}

export function settlementStepUpResponse(err: SettlementStepUpRequiredError): Record<string, unknown> {
  return {
    ok: false,
    error: err.message,
    code: err.code,
    approval_id: err.approvalId,
    tier: err.tier,
    step_up_required: true,
  };
}
