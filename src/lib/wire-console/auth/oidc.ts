import { createHmac, timingSafeEqual } from "node:crypto";

export interface OidcClaims {
  sub: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  operator_id?: string;
  approver_id?: string;
  email?: string;
  name?: string;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function parseJwt(token: string): { header: Record<string, unknown>; payload: OidcClaims; signed: string; sig: Buffer } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]!).toString("utf-8")) as Record<string, unknown>;
    const payload = JSON.parse(base64UrlDecode(parts[1]!).toString("utf-8")) as OidcClaims;
    return {
      header,
      payload,
      signed: `${parts[0]}.${parts[1]}`,
      sig: base64UrlDecode(parts[2]!),
    };
  } catch {
    return null;
  }
}

function verifyHs256(signed: string, signature: Buffer, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(signed).digest();
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(expected, signature);
}

export function getOidcConfig() {
  return {
    issuer: process.env.WIRE_CONSOLE_OIDC_ISSUER ?? "",
    audience: process.env.WIRE_CONSOLE_OIDC_AUDIENCE ?? "",
    client_id: process.env.WIRE_CONSOLE_OIDC_CLIENT_ID ?? "",
  };
}

export function verifyOidcIdToken(
  idToken: string,
  opts?: { approver_id?: string }
): { operator_id: string; approver_id: string } | { error: string } {
  const secret = process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
  if (!secret) {
    return { error: "WIRE_CONSOLE_OIDC_HS256_SECRET is required for OIDC adapter" };
  }
  const cfg = getOidcConfig();
  if (!cfg.issuer || !cfg.audience) {
    return { error: "WIRE_CONSOLE_OIDC_ISSUER and WIRE_CONSOLE_OIDC_AUDIENCE are required" };
  }

  const parsed = parseJwt(idToken);
  if (!parsed) return { error: "invalid id_token" };
  if (parsed.header.alg !== "HS256") {
    return { error: "unsupported id_token alg (HS256 only in this adapter)" };
  }
  if (!verifyHs256(parsed.signed, parsed.sig, secret)) {
    return { error: "invalid id_token signature" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.payload.exp != null && parsed.payload.exp < now) {
    return { error: "id_token expired" };
  }
  if (parsed.payload.iss !== cfg.issuer) {
    return { error: "id_token issuer mismatch" };
  }
  const aud = parsed.payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(cfg.audience) : aud === cfg.audience;
  if (!audOk) {
    return { error: "id_token audience mismatch" };
  }

  const operatorId =
    parsed.payload.operator_id ??
    parsed.payload.email ??
    parsed.payload.name ??
    parsed.payload.sub;
  const approverId = opts?.approver_id ?? parsed.payload.approver_id ?? operatorId;
  if (!operatorId || !approverId) {
    return { error: "operator_id and approver_id required (token claims or login body)" };
  }

  return { operator_id: operatorId, approver_id: approverId };
}

/** Test helper — mint HS256 id_token for vitest/playwright. */
export function mintTestOidcIdToken(claims: {
  sub: string;
  operator_id?: string;
  approver_id?: string;
  exp?: number;
}): string {
  const secret = process.env.WIRE_CONSOLE_OIDC_HS256_SECRET ?? "test-oidc-secret";
  const issuer = process.env.WIRE_CONSOLE_OIDC_ISSUER ?? "https://idp.test/orgos";
  const audience = process.env.WIRE_CONSOLE_OIDC_AUDIENCE ?? "wire-console";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: claims.sub,
      operator_id: claims.operator_id ?? claims.sub,
      approver_id: claims.approver_id ?? claims.operator_id ?? claims.sub,
      exp: claims.exp ?? Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const signed = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(signed).digest("base64url");
  return `${signed}.${sig}`;
}
