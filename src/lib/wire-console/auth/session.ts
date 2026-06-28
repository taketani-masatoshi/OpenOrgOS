import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  loadPersistedSessions,
  savePersistedSessions,
  sessionPersistenceEnabled,
  sessionTtlMs,
  type PersistedSessionRecord,
} from "../../console-auth/session-store.js";

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

export function registerSession(user: WireConsoleUser): { token: string; user: WireConsoleUser } {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { user, created_at: new Date().toISOString() });
  persistSessionsToDisk();
  return { token, user };
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
  const user: WireConsoleUser = {
    operator_id: login.operator_id ?? "秘書オペレータ",
    approver_id: login.approver_id ?? login.operator_id ?? "秘書オペレータ",
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
  return sessions.get(token)?.user;
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? "";
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

export function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${WIRE_CONSOLE_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`
  );
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader(
    "Set-Cookie",
    `${WIRE_CONSOLE_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
  );
}

export function resetSessionsForTests(): void {
  sessions.clear();
}
