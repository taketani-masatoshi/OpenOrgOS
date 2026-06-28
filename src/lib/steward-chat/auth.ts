import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authenticateWireConsoleLogin,
  createWebAuthnLoginOptions,
  getWireConsoleAuthConfigResponse,
} from "../wire-console/auth/login.js";
import {
  clearSessionCookie,
  destroySession,
  getSessionUser,
  sessionTokenFromRequest,
  setSessionCookie,
  type WireConsoleUser,
} from "../wire-console/auth/session.js";
import { completeWebAuthnE2eLogin, isWebAuthnE2eLoginEnabled } from "../wire-console/auth/webauthn-e2e.js";
import {
  createWebAuthnRegisterOptions,
  isWebAuthnRegistrationAllowed,
  verifyWebAuthnRegistration,
} from "../wire-console/auth/webauthn-register.js";
import { resolveChatPermissions } from "../console-auth/rbac.js";
import { appendChatAudit } from "./audit.js";

function authUserPayload(user: WireConsoleUser) {
  return { ...user, permissions: resolveChatPermissions(user) };
}

export function isStewardChatAuthEnabled(): boolean {
  return process.env.STEWARD_CHAT_AUTH !== "0";
}

export function isPublicChatPath(pathname: string, method: string): boolean {
  if (pathname === "/health") return true;
  if (pathname.startsWith("/chat/v1/auth/")) return true;
  if (method === "GET" && (pathname === "/" || pathname.startsWith("/assets/"))) return true;
  return false;
}

export function getChatSessionUser(req: IncomingMessage): WireConsoleUser | undefined {
  return getSessionUser(sessionTokenFromRequest(req));
}

export function requireChatAuth(
  req: IncomingMessage,
  res: ServerResponse
): WireConsoleUser | null {
  if (!isStewardChatAuthEnabled()) {
    return {
      operator_id: "dev-bypass",
      approver_id: "dev-bypass",
      mode: "dev",
    };
  }

  const user = getChatSessionUser(req);
  if (!user) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
    return null;
  }
  return user;
}

export async function handleChatAuthApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  readBody: (req: IncomingMessage) => Promise<string>
): Promise<boolean> {
  function json(status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  }

  if (method === "GET" && pathname === "/chat/v1/auth/config") {
    json(200, { ok: true, ...getWireConsoleAuthConfigResponse(), service: "steward-chat" });
    return true;
  }

  if (method === "GET" && pathname === "/chat/v1/auth/me") {
    const user = getChatSessionUser(req);
    if (!user) {
      json(401, { ok: false, error: "unauthorized" });
      return true;
    }
    json(200, { ok: true, user: authUserPayload(user), permissions: resolveChatPermissions(user) });
    return true;
  }

  if (method === "POST" && pathname === "/chat/v1/auth/webauthn/options") {
    try {
      const result = createWebAuthnLoginOptions();
      json(200, { ok: true, ...result });
      return true;
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/chat/v1/auth/webauthn/e2e-complete") {
    if (!isWebAuthnE2eLoginEnabled()) {
      json(404, { ok: false, error: "not found" });
      return true;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { challenge?: string };
      if (!body.challenge) {
        json(422, { ok: false, error: "challenge required" });
        return true;
      }
      const result = completeWebAuthnE2eLogin(body.challenge);
      if ("error" in result) {
        json(401, { ok: false, error: result.error });
        return true;
      }
      setSessionCookie(res, result.token);
      appendChatAudit({
        action: "login",
        operator_id: result.user.operator_id,
        approver_id: result.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(200, { ok: true, user: authUserPayload(result.user) });
      return true;
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/chat/v1/auth/webauthn/register/options") {
    if (!isWebAuthnRegistrationAllowed()) {
      json(403, { ok: false, error: "WebAuthn registration disabled" });
      return true;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { operator_id?: string; approver_id?: string };
      const result = createWebAuthnRegisterOptions({
        operator_id: body.operator_id ?? "",
        approver_id: body.approver_id ?? "",
      });
      if ("error" in result) {
        json(422, { ok: false, error: result.error });
        return true;
      }
      json(200, { ok: true, ...result });
      return true;
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/chat/v1/auth/webauthn/register") {
    if (!isWebAuthnRegistrationAllowed()) {
      json(403, { ok: false, error: "WebAuthn registration disabled" });
      return true;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as Parameters<typeof verifyWebAuthnRegistration>[0];
      const result = verifyWebAuthnRegistration(body);
      if ("error" in result) {
        json(401, { ok: false, error: result.error });
        return true;
      }
      setSessionCookie(res, result.token);
      appendChatAudit({
        action: "login",
        operator_id: result.user.operator_id,
        approver_id: result.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(200, { ok: true, user: authUserPayload(result.user) });
      return true;
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/chat/v1/auth/login") {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as Parameters<typeof authenticateWireConsoleLogin>[0];
      const result = authenticateWireConsoleLogin(body);
      if ("error" in result) {
        appendChatAudit({
          action: "login",
          operator_id: body.operator_id ?? "unknown",
          approver_id: body.approver_id ?? body.operator_id ?? "unknown",
          ok: false,
          path: pathname,
          detail: result.error,
        });
        json(result.status, { ok: false, error: result.error });
        return true;
      }
      setSessionCookie(res, result.token);
      appendChatAudit({
        action: "login",
        operator_id: result.user.operator_id,
        approver_id: result.user.approver_id,
        ok: true,
        path: pathname,
      });
      json(200, { ok: true, user: authUserPayload(result.user), deprecated: result.deprecated });
      return true;
    } catch (e) {
      json(400, { ok: false, error: e instanceof Error ? e.message : String(e) });
      return true;
    }
  }

  if (method === "POST" && pathname === "/chat/v1/auth/logout") {
    const user = getChatSessionUser(req);
    destroySession(sessionTokenFromRequest(req));
    clearSessionCookie(res);
    if (user) {
      appendChatAudit({
        action: "logout",
        operator_id: user.operator_id,
        approver_id: user.approver_id,
        ok: true,
        path: pathname,
      });
    }
    json(200, { ok: true });
    return true;
  }

  return false;
}
