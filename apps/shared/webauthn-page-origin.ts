const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Local WebAuthn RP ID must be `localhost` — IP addresses are not valid RP IDs (web.dev). */
export const LOCAL_WEBAUTHN_CANONICAL_HOST = "localhost";

function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host);
}

/**
 * WebAuthn RP ID must equal the page hostname.
 * For loopback dev, always canonicalize to localhost so 127.0.0.1 bookmarks still work.
 */
export function ensureWebAuthnRpHost(rpId: string | undefined): boolean {
  if (!rpId || typeof window === "undefined") return true;
  const host = window.location.hostname;
  if (host === rpId) return true;
  if (!isLoopbackHost(host) || !isLoopbackHost(rpId)) return false;
  const next = new URL(window.location.href);
  next.hostname = LOCAL_WEBAUTHN_CANONICAL_HOST;
  window.location.replace(next.toString());
  return false;
}

export function ensureWebAuthnPageOrigin(expectedOrigin: string | undefined): boolean {
  if (!expectedOrigin || typeof window === "undefined") return true;
  try {
    const expected = new URL(expectedOrigin);
    if (window.location.origin === expected.origin) return true;
    if (!isLoopbackHost(window.location.hostname) || !isLoopbackHost(expected.hostname)) {
      return false;
    }
    const next = new URL(window.location.href);
    next.protocol = expected.protocol;
    next.hostname = LOCAL_WEBAUTHN_CANONICAL_HOST;
    next.port = expected.port;
    window.location.replace(next.toString());
    return false;
  } catch {
    return true;
  }
}
