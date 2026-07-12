import type { IncomingMessage, ServerResponse } from "node:http";
import { isMutatingMethod } from "./csrf.js";

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

type RateBucket = "default" | "ask" | "login";

function bucketForPath(pathname: string): RateBucket {
  if (pathname === "/chat/v1/message" || pathname === "/chat/v1/message/stream") {
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
  pathname: string
): { allowed: boolean; retryAfterSec?: number } {
  if (!shouldApplyRateLimit(pathname, req.method ?? "GET")) {
    return { allowed: true };
  }

  const bucket = bucketForPath(pathname);
  const windowMs = rateLimitWindowMs();
  const max = maxForBucket(bucket);
  const key = `${clientKey(req)}:${bucket}:${pathname}`;
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
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  state.timestamps.push(now);
  return { allowed: true };
}

/** Returns true when the request was rejected (429). */
export function rejectRateLimitExceeded(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = new URL(req.url ?? "/", "http://local").pathname;
  if (!shouldApplyRateLimit(pathname, req.method ?? "GET")) return false;

  const result = checkRateLimit(req, pathname);
  if (result.allowed) return false;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
  };
  if (result.retryAfterSec) {
    headers["Retry-After"] = String(result.retryAfterSec);
  }
  res.writeHead(429, headers);
  res.end(JSON.stringify({ ok: false, error: "rate_limit_exceeded" }));
  return true;
}
