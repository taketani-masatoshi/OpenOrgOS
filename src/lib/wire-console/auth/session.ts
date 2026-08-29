import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  cookieSecureEnabled,
  loadPersistedSessions,
  savePersistedSessions,
  sessionPersistenceEnabled,
  sessionTtlMs,
  type PersistedSessionRecord,
} from "../../console-auth/session-store.js";
import { boundApproverId, findOperatorById } from "../../org/operators.js";

export interface WireConsoleUser {
  operator_id: string;
  approver_id: string;
  mode: "dev" | "prod";
}

interface SessionRecord {
  user: WireConsoleUser;
  created_at: string;
}

const sessions = new Map<string, SessionRecord>();

function hydrateSessionsFromDisk(): void {
  if (!sessionPersistenceEnabled()) return;
  for (const [token, record] of loadPersistedSessions()) {
    sessions.set(token, { user: record.user, created_at: record.created_at });
  }
}

function persistSessionsToDisk(): void {
  if (!sessionPersistenceEnabled()) return;
  const out = new Map<string, PersistedSessionRecord>();
  const expiresAt = new Date(Date.now() + sessionTtlMs()).toISOString();
  for (const [token, record] of sessions) {
    out.set(token, { user: record.user, created_at: record.created_at, expires_at: expiresAt });
  }
  savePersistedSessions(out);
}

hydrateSessionsFromDisk();

export const WIRE_CONSOLE_SESSION_COOKIE = "orgos_wire_session";

function devPasskeyExpected(): string {
  return process.env.WIRE_CONSOLE_DEV_PASSKEY ?? "orgos-dev";
}

function bindSessionUser(user: WireConsoleUser): WireConsoleUser {
  try {
    return {
      ...user,
      approver_id: boundApproverId(user.operator_id, user.approver_id),
    };
  } catch {
    return user;
  }
}

export function registerSession(user: WireConsoleUser): { token: string; user: WireConsoleUser } {
  const token = randomBytes(24).toString("hex");
  const bound = bindSessionUser(user);
  sessions.set(token, { user: bound, created_at: new Date().toISOString() });
  persistSessionsToDisk();
  return { token, user: bound };
}

export function createDevSession(login: {
  passkey: string;
  operator_id?: string;
  approver_id?: string;
}): { token: string; user: WireConsoleUser } | { error: string } {
  const expected = Buffer.from(devPasskeyExpected(), "utf-8");
  const got = Buffer.from(login.passkey, "utf-8");
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { error: "invalid passkey" };
  }
  const requestedOperator = login.operator_id?.trim() || "OP-001";
  let operatorId = requestedOperator;
  let approverId = login.approver_id?.trim() || requestedOperator;
  try {
    const op = findOperatorById(requestedOperator);
    if (op) {
      operatorId = op.operator_id;
      approverId = op.approver_name?.trim() || op.display_name.trim();
    }
  } catch {
    /* registry unavailable — keep submitted ids */
  }
  const user: WireConsoleUser = {
    operator_id: operatorId,
    approver_id: approverId,
    mode: "dev",
  };
  return registerSession(user);
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
  persistSessionsToDisk();
}

export function getSessionUser(token: string | undefined): WireConsoleUser | undefined {
  if (!token) return undefined;
  const user = sessions.get(token)?.user;
  return user ? bindSessionUser(user) : undefined;
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers?.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}

export function sessionTokenFromRequest(req: IncomingMessage): string | undefined {
  return parseCookies(req)[WIRE_CONSOLE_SESSION_COOKIE];
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function cookieHostFromRequest(req: IncomingMessage): string {
  const forwarded = firstHeaderValue(req.headers["x-forwarded-host"]);
  const raw = (forwarded || firstHeaderValue(req.headers.host)).split(",")[0]?.trim() ?? "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("[")) {
    const end = lower.indexOf("]");
    if (end !== -1) return lower.slice(0, end + 1);
  }
  return lower.split(":")[0] ?? "";
}

const LOOPBACK_COOKIE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Public HTTPS keeps Secure. Loopback HTTP (Cursor / local :9470) must not,
 * or the browser drops the session and the next API call is 401.
 */
export function cookieSecureForRequest(req?: IncomingMessage): boolean {
  if (!cookieSecureEnabled()) return false;
  if (!req) return true;
  const host = cookieHostFromRequest(req);
  if (!host) return true;
  return !LOOPBACK_COOKIE_HOSTS.has(host);
}

function sessionCookieBase(tokenValue: string, req?: IncomingMessage): string {
  const secure = cookieSecureForRequest(req) ? "; Secure" : "";
  return `${WIRE_CONSOLE_SESSION_COOKIE}=${tokenValue}; Path=/; HttpOnly; SameSite=Strict${secure}`;
}

export function sessionCookieHeader(token: string, req?: IncomingMessage): string {
  return sessionCookieBase(encodeURIComponent(token), req);
}

export function setSessionCookie(res: ServerResponse, token: string, req?: IncomingMessage): void {
  res.setHeader("Set-Cookie", sessionCookieHeader(token, req));
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${sessionCookieBase("")}; Max-Age=0`);
}

export function resetSessionsForTests(): void {
  sessions.clear();
}
