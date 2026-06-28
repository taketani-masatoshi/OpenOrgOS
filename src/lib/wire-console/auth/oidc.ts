import { createHmac, createSign, timingSafeEqual, type KeyObject } from "node:crypto";
import { hasOidcJwks, preloadOidcJwks, verifyRs256Signature } from "./oidc-jwks.js";

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

function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: OidcClaims;
  signed: string;
  sig: Buffer;
} | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]!).toString("utf-8")) as Record<
      string,
      unknown
    >;
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
    jwks_configured: Boolean(
      process.env.WIRE_CONSOLE_OIDC_JWKS_URL || process.env.WIRE_CONSOLE_OIDC_JWKS_JSON
    ),
    hs256_configured: Boolean(process.env.WIRE_CONSOLE_OIDC_HS256_SECRET),
  };
}

function resolveIdentity(
  payload: OidcClaims,
  opts?: { approver_id?: string }
): { operator_id: string; approver_id: string } | { error: string } {
  const operatorId =
    payload.operator_id ??
    payload.email ??
    payload.name ??
    payload.sub;
  const approverId = opts?.approver_id ?? payload.approver_id ?? operatorId;
  if (!operatorId || !approverId) {
    return { error: "operator_id and approver_id required (token claims or login body)" };
  }
  return { operator_id: operatorId, approver_id: approverId };
}

export function verifyOidcIdToken(
  idToken: string,
  opts?: { approver_id?: string }
): { operator_id: string; approver_id: string } | { error: string } {
  const cfg = getOidcConfig();
  if (!cfg.issuer || !cfg.audience) {
    return { error: "WIRE_CONSOLE_OIDC_ISSUER and WIRE_CONSOLE_OIDC_AUDIENCE are required" };
  }

  const parsed = parseJwt(idToken);
  if (!parsed) return { error: "invalid id_token" };

  const alg = parsed.header.alg;
  if (alg === "HS256") {
    if (
      process.env.WIRE_CONSOLE_AUTH === "prod" &&
      hasOidcJwks() &&
      process.env.WIRE_CONSOLE_OIDC_ALLOW_HS256 !== "1"
    ) {
      return {
        error:
          "HS256 id_token disabled when JWKS is configured — use RS256 or set WIRE_CONSOLE_OIDC_ALLOW_HS256=1",
      };
    }
    const secret = process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
    if (!secret) {
      return { error: "WIRE_CONSOLE_OIDC_HS256_SECRET is required for HS256 id_token" };
    }
    if (!verifyHs256(parsed.signed, parsed.sig, secret)) {
      return { error: "invalid id_token signature" };
    }
  } else if (alg === "RS256") {
    if (!hasOidcJwks()) {
      return {
        error:
          "OIDC JWKS not loaded — set WIRE_CONSOLE_OIDC_JWKS_JSON or WIRE_CONSOLE_OIDC_JWKS_URL",
      };
    }
    const kid = typeof parsed.header.kid === "string" ? parsed.header.kid : undefined;
    if (!verifyRs256Signature(parsed.signed, parsed.sig, kid)) {
      return { error: "invalid id_token signature" };
    }
  } else {
    return { error: `unsupported id_token alg (${String(alg)})` };
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

  const identity = resolveIdentity(parsed.payload, opts);
  if ("error" in identity) return identity;
  return identity;
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

/** Test helper — mint RS256 id_token when JWKS + private key are supplied in tests. */
export function mintTestOidcIdTokenRs256(
  privateKey: KeyObject,
  claims: {
    sub: string;
    kid?: string;
    operator_id?: string;
    approver_id?: string;
    exp?: number;
  }
): string {
  const issuer = process.env.WIRE_CONSOLE_OIDC_ISSUER ?? "https://idp.test/orgos";
  const audience = process.env.WIRE_CONSOLE_OIDC_AUDIENCE ?? "wire-console";
  const header = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: claims.kid ?? "test-rsa",
    })
  ).toString("base64url");
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
  const sig = createSign("RSA-SHA256").update(signed).sign(privateKey, "base64url");
  return `${signed}.${sig}`;
}

export { preloadOidcJwks };
