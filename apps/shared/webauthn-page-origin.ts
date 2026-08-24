import { browserSupportsWebAuthn } from "./webauthn-simple";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Local WebAuthn RP ID must be `localhost` — IP addresses are not valid RP IDs (web.dev). */
export const LOCAL_WEBAUTHN_CANONICAL_HOST = "localhost";

export class WebAuthnRedirectInProgressError extends Error {
  constructor() {
    super("WEBAUTHN_REDIRECT_IN_PROGRESS");
    this.name = "WebAuthnRedirectInProgressError";
  }
}

export type WebAuthnHostCheck = "ok" | "redirecting" | "mismatch";

export type WebAuthnPageInspect =
  | { status: "ok" }
  | { status: "redirecting" }
  | { status: "unsupported_browser" }
  | { status: "origin_mismatch"; expectedOrigin?: string; rpId?: string };

function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host);
}

function resolveRpHost(rpId: string): WebAuthnHostCheck {
  if (typeof window === "undefined") return "ok";
  const host = window.location.hostname;
  if (host === rpId) return "ok";
  if (!isLoopbackHost(host) || !isLoopbackHost(rpId)) return "mismatch";
  const next = new URL(window.location.href);
  next.hostname = LOCAL_WEBAUTHN_CANONICAL_HOST;
  window.location.replace(next.toString());
  return "redirecting";
}

function resolvePageOrigin(expectedOrigin: string): WebAuthnHostCheck {
  if (typeof window === "undefined") return "ok";
  try {
    const expected = new URL(expectedOrigin);
    if (window.location.origin === expected.origin) return "ok";
    if (!isLoopbackHost(window.location.hostname) || !isLoopbackHost(expected.hostname)) {
      return "mismatch";
    }
    const next = new URL(window.location.href);
    next.protocol = expected.protocol;
    next.hostname = LOCAL_WEBAUTHN_CANONICAL_HOST;
    next.port = expected.port;
    window.location.replace(next.toString());
    return "redirecting";
  } catch {
    return "ok";
  }
}

/** Inspect page before rendering PassKey UI (no throw). */
export function inspectWebAuthnPage(opts: {
  expectedOrigin?: string;
  rpId?: string;
}): WebAuthnPageInspect {
  if (typeof window !== "undefined" && !browserSupportsWebAuthn()) {
    return { status: "unsupported_browser" };
  }
  if (opts.expectedOrigin) {
    const origin = resolvePageOrigin(opts.expectedOrigin);
    if (origin === "redirecting") return { status: "redirecting" };
    if (origin === "mismatch") {
      return { status: "origin_mismatch", expectedOrigin: opts.expectedOrigin, rpId: opts.rpId };
    }
  }
  if (opts.rpId) {
    const rp = resolveRpHost(opts.rpId);
    if (rp === "redirecting") return { status: "redirecting" };
    if (rp === "mismatch") {
      return { status: "origin_mismatch", expectedOrigin: opts.expectedOrigin, rpId: opts.rpId };
    }
  }
  return { status: "ok" };
}

/**
 * WebAuthn RP ID must equal the page hostname.
 * For loopback dev, canonicalize to localhost so 127.0.0.1 bookmarks still work.
 * @deprecated Prefer assertWebAuthnRpHost in ceremony code.
 */
export function ensureWebAuthnRpHost(rpId: string | undefined): boolean {
  if (!rpId) return true;
  const result = resolveRpHost(rpId);
  return result === "ok";
}

/** @deprecated Prefer inspectWebAuthnPage in React mount. */
export function ensureWebAuthnPageOrigin(expectedOrigin: string | undefined): boolean {
  if (!expectedOrigin) return true;
  return resolvePageOrigin(expectedOrigin) === "ok";
}

/** Call immediately before WebAuthn ceremony — redirects or throws. */
export function assertWebAuthnRpHost(rpId: string | undefined): void {
  if (!rpId) return;
  const result = resolveRpHost(rpId);
  if (result === "redirecting") throw new WebAuthnRedirectInProgressError();
  if (result === "mismatch") throw new Error("webauthn origin mismatch");
}
