import type { IncomingMessage, ServerResponse } from "node:http";

export function isCsrfDisabled(): boolean {
  return process.env.ORGOS_CSRF === "0";
}

export function isMutatingMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export function isCsrfExemptPath(pathname: string): boolean {
  return (
    pathname === "/chat/v1/auth/login" ||
    pathname === "/chat/v1/auth/logout" ||
    pathname === "/console/v1/auth/login" ||
    pathname === "/console/v1/auth/logout" ||
    pathname.startsWith("/chat/v1/auth/webauthn/") ||
    pathname.startsWith("/console/v1/auth/webauthn/") ||
    pathname === "/chat/v1/settlement/complete" ||
    pathname === "/chat/v1/settlement/enroll" ||
    pathname === "/chat/v1/settlement/enroll/options" ||
    pathname.startsWith("/chat/v1/settlement/challenge/")
  );
}

export function shouldApplyCsrf(pathname: string, method: string): boolean {
  if (!isMutatingMethod(method)) return false;
  if (isCsrfExemptPath(pathname)) return false;
  return pathname.startsWith("/chat/v1/") || pathname.startsWith("/console/v1/");
}

export function allowedOrigins(hostHeader: string | undefined): string[] {
  const origins = new Set<string>();
  const explicit =
    process.env.ORGOS_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  for (const o of explicit) {
    origins.add(o.replace(/\/$/, ""));
  }
  const settle =
    process.env.ORGOS_SETTLEMENT_APPROVE_ORIGIN?.trim() || "https://approve.oorgos.org";
  origins.add(settle.replace(/\/$/, ""));
  if (hostHeader) {
    const h = hostHeader.trim();
    origins.add(`http://${h}`);
    origins.add(`https://${h}`);
  }
  return [...origins];
}

export function requestOrigin(req: IncomingMessage): string | undefined {
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/$/, "");
  const referer = req.headers.referer;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function verifySameOrigin(req: IncomingMessage, hostHeader?: string): boolean {
  if (isCsrfDisabled()) return true;
  if (!isMutatingMethod(req.method ?? "GET")) return true;
  const origin = requestOrigin(req);
  if (!origin) return false;
  const allowed = allowedOrigins(hostHeader ?? req.headers.host);
  return allowed.some((a) => origin === a);
}

/** Returns true when the request was rejected (403). */
export function rejectCsrfOriginMismatch(
  req: IncomingMessage,
  res: ServerResponse,
  hostHeader?: string
): boolean {
  if (!shouldApplyCsrf(new URL(req.url ?? "/", "http://local").pathname, req.method ?? "GET")) {
    return false;
  }
  if (verifySameOrigin(req, hostHeader)) return false;
  res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "csrf_origin_mismatch" }));
  return true;
}
