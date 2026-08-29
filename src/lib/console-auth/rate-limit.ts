import type { IncomingMessage, ServerResponse } from "node:http";
import { isMutatingMethod } from "./csrf.js";
import { findControlPlaneTenant } from "../product/ledger-control-plane.js";

export function isRateLimitDisabled(): boolean {
  return process.env.ORGOS_RATE_LIMIT === "0";
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function rateLimitWindowMs(): number {
  return parseIntEnv("ORGOS_RATE_LIMIT_WINDOW_MS", 60_000);
}

export function rateLimitDefaultMax(): number {
  return parseIntEnv("ORGOS_RATE_LIMIT_MAX", 60);
}

export function rateLimitAskMax(): number {
  return parseIntEnv("ORGOS_RATE_LIMIT_ASK_MAX", 10);
}

export function rateLimitLoginMax(): number {
  return parseIntEnv("ORGOS_RATE_LIMIT_LOGIN_MAX", 20);
}

export function rateLimitTenantDefaultMax(): number {
  return parseIntEnv("ORGOS_RATE_LIMIT_TENANT_MAX", rateLimitDefaultMax());
}

type RateBucket = "default" | "ask" | "login";

function bucketForPath(pathname: string): RateBucket {
  if (
    pathname === "/chat/v1/message" ||
    pathname === "/chat/v1/message/stream"
  ) {
    return "ask";
  }
  if (pathname === "/chat/v1/auth/login" || pathname === "/console/v1/auth/login") {
    return "login";
  }
  return "default";
}

function maxForBucket(bucket: RateBucket): number {
  switch (bucket) {
    case "ask":
      return rateLimitAskMax();
    case "login":
      return rateLimitLoginMax();
    default:
      return rateLimitDefaultMax();
  }
}

/** Plan-aware per-tenant mutation cap (control-plane plan when available). */
export function rateLimitMaxForTenant(
  tenantId: string | null | undefined,
  plan?: string | null,
): number {
  const resolvedPlan = plan?.trim().toLowerCase();
  if (resolvedPlan === "starter") {
    return parseIntEnv(
      "ORGOS_RATE_LIMIT_TENANT_STARTER_MAX",
      Math.min(30, rateLimitTenantDefaultMax()),
    );
  }
  if (resolvedPlan === "accountant") {
    return parseIntEnv(
      "ORGOS_RATE_LIMIT_TENANT_ACCOUNTANT_MAX",
      Math.max(120, rateLimitTenantDefaultMax()),
    );
  }
  if (resolvedPlan === "business") {
    return parseIntEnv(
      "ORGOS_RATE_LIMIT_TENANT_BUSINESS_MAX",
      rateLimitTenantDefaultMax(),
    );
  }
  if (tenantId) return rateLimitTenantDefaultMax();
  return rateLimitDefaultMax();
}

function resolveTenantPlan(tenantId: string | null): string | null {
  if (!tenantId) return null;
  try {
    return findControlPlaneTenant(tenantId)?.plan ?? null;
  } catch {
    return null;
  }
}

export function resolveTenantIdForRateLimit(req: IncomingMessage): string | null {
  const header = req.headers["x-orgos-tenant"];
  if (typeof header === "string" && header.trim()) {
    return header.trim().toLowerCase();
  }
  const host = req.headers.host?.split(":")[0]?.toLowerCase() ?? "";
  const suffix = process.env.ORGOS_LEDGER_HOST_SUFFIX?.trim() || ".ledger.localhost";
  if (host.endsWith(suffix)) {
    const slug = host.slice(0, -suffix.length);
    if (slug && !slug.includes(".")) return slug;
  }
  return null;
}

export function shouldApplyRateLimit(pathname: string, method: string): boolean {
  if (isRateLimitDisabled()) return false;
  if (!isMutatingMethod(method)) return false;
  if (pathname === "/health") return false;
  return pathname.startsWith("/chat/v1/") || pathname.startsWith("/console/v1/");
}

function clientKey(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    "unknown";
  return ip;
}

interface WindowState {
  timestamps: number[];
}

const windows = new Map<string, WindowState>();

/** Reset in-memory counters (tests only). */
export function resetRateLimitState(): void {
  windows.clear();
}

function prune(state: WindowState, now: number, windowMs: number): void {
  const cutoff = now - windowMs;
  while (state.timestamps.length > 0 && state.timestamps[0]! < cutoff) {
    state.timestamps.shift();
  }
}

export function checkRateLimit(
  req: IncomingMessage,
  pathname: string,
  opts?: { tenantId?: string | null },
): { allowed: boolean; retryAfterSec?: number; tenantId?: string | null } {
  if (!shouldApplyRateLimit(pathname, req.method ?? "GET")) {
    return { allowed: true };
  }

  const tenantId =
    opts?.tenantId !== undefined
      ? opts.tenantId
      : resolveTenantIdForRateLimit(req);
  const bucket = bucketForPath(pathname);
  const windowMs = rateLimitWindowMs();
  const plan = resolveTenantPlan(tenantId);
  const bucketMax = maxForBucket(bucket);
  const tenantMax = rateLimitMaxForTenant(tenantId, plan);
  const max = bucket === "login" ? bucketMax : Math.min(bucketMax, tenantMax);
  const key = `${tenantId ?? "global"}:${clientKey(req)}:${bucket}:${pathname}`;
  const now = Date.now();

  let state = windows.get(key);
  if (!state) {
    state = { timestamps: [] };
    windows.set(key, state);
  }

  prune(state, now, windowMs);

  if (state.timestamps.length >= max) {
    const oldest = state.timestamps[0] ?? now;
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, retryAfterSec),
      tenantId,
    };
  }

  state.timestamps.push(now);
  return { allowed: true, tenantId };
}

/** Returns true when the request was rejected (429). */
export function rejectRateLimitExceeded(
  req: IncomingMessage,
  res: ServerResponse,
  opts?: { tenantId?: string | null },
): boolean {
  const pathname = new URL(req.url ?? "/", "http://local").pathname;
  if (!shouldApplyRateLimit(pathname, req.method ?? "GET")) return false;

  const result = checkRateLimit(req, pathname, opts);
  if (result.allowed) return false;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (result.retryAfterSec) {
    headers["Retry-After"] = String(result.retryAfterSec);
  }
  res.writeHead(429, headers);
  res.end(
    JSON.stringify({
      ok: false,
      error: "rate_limit_exceeded",
      tenant_id: result.tenantId ?? null,
    }),
  );
  return true;
}
