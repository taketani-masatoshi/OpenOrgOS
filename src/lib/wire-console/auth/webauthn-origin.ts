const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
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
