const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function configuredWebAuthnOrigin(): string | undefined {
  const value = (process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN ?? "").trim().replace(/\/$/, "");
  return value || undefined;
}

export function isLoopbackWebAuthnOrigin(origin?: string): boolean {
  if (!origin) return false;
  try {
    return LOOPBACK.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/**
 * Prod keeps fail-closed (env origin required).
 * Local dev accepts the browser loopback origin so ID/password → PassKey
 * issuance works without WIRE_CONSOLE_WEBAUTHN_ORIGIN.
 */
export function resolveExpectedWebAuthnOrigin(clientOrigin?: string): string | undefined {
  const configured = configuredWebAuthnOrigin();
  if (configured) return configured;
  const prod =
    process.env.ORGOS_ENV === "production" ||
    process.env.ORGOS_PROD === "1" ||
    process.env.WIRE_CONSOLE_AUTH === "prod";
  if (prod) return undefined;
  if (isLoopbackWebAuthnOrigin(clientOrigin)) return clientOrigin;
  return undefined;
}

/** True when two WebAuthn origins are the same site, including loopback aliases. */
export function webauthnOriginsEqual(actual?: string, expected?: string): boolean {
  // Missing sides must fail closed (passkey-production-security-plan §2.1).
  if (!expected || !actual) return false;
  if (actual === expected) return true;
  const a = parseOrigin(actual);
  const e = parseOrigin(expected);
  if (!a || !e) return false;
  if (a.protocol !== e.protocol) return false;
  const aPort = a.port || (a.protocol === "https:" ? "443" : "80");
  const ePort = e.port || (e.protocol === "https:" ? "443" : "80");
  if (aPort !== ePort) return false;
  if (a.hostname === e.hostname) return true;
  return LOOPBACK.has(a.hostname) && LOOPBACK.has(e.hostname);
}
