/**
 * ADR 0037 · Phase 4 — production WebAuthn / settlement passkey readiness.
 */

export interface WebAuthnPublicConfig {
  rp_id?: string;
  origin?: string;
  settlement_count?: number;
  registration_allowed?: boolean;
}

function trimOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

export function hostLooksPublic(host: string | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  return h !== "127.0.0.1" && h !== "localhost" && h !== "::1" && h !== "0.0.0.0";
}

/** Hostname from WIRE_CONSOLE_WEBAUTHN_ORIGIN (includes port when non-default). */
export function webAuthnOriginHost(origin: string): string | null {
  try {
    return new URL(trimOrigin(origin)).host;
  } catch {
    return null;
  }
}

export function webAuthnOriginHostname(origin: string): string | null {
  try {
    return new URL(trimOrigin(origin)).hostname;
  } catch {
    return null;
  }
}

/** Deploy URL (e.g. https://operator.example.com) must match public webauthn config. */
export function validateDeployUrlMatchesWebAuthn(
  deployUrl: string,
  webauthn: WebAuthnPublicConfig | undefined
): string[] {
  const failures: string[] = [];
  if (!webauthn) {
    failures.push("auth config missing webauthn block");
    return failures;
  }

  let deploy: URL;
  try {
    deploy = new URL(deployUrl.replace(/\/$/, ""));
  } catch {
    failures.push(`invalid deploy URL: ${deployUrl}`);
    return failures;
  }

  const expectedOrigin = `${deploy.protocol}//${deploy.host}`;
  const configuredOrigin = webauthn.origin ? trimOrigin(webauthn.origin) : "";

  if (!configuredOrigin) {
    failures.push("webauthn.origin unset on server — set WIRE_CONSOLE_WEBAUTHN_ORIGIN");
  } else if (configuredOrigin !== expectedOrigin) {
    failures.push(
      `webauthn.origin=${configuredOrigin} does not match deploy URL ${expectedOrigin}`
    );
  }

  if (!webauthn.rp_id?.trim()) {
    failures.push("webauthn.rp_id unset — set WIRE_CONSOLE_WEBAUTHN_RP_ID");
  } else if (deploy.protocol === "https:" && webauthn.rp_id !== deploy.hostname) {
    failures.push(
      `webauthn.rp_id=${webauthn.rp_id} must equal hostname ${deploy.hostname} for HTTPS (single RP)`
    );
  } else if (
    deploy.protocol === "http:" &&
    (deploy.hostname === "localhost" || deploy.hostname === "127.0.0.1")
  ) {
    if (webauthn.rp_id !== "localhost") {
      failures.push(`local console rp_id must be localhost (got ${webauthn.rp_id})`);
    }
  }

  if (deploy.protocol === "https:" && configuredOrigin && !configuredOrigin.startsWith("https://")) {
    failures.push("HTTPS deploy requires webauthn.origin https://");
  }

  return failures;
}

export interface WebAuthnEnvValidation {
  ok: boolean;
  detail: string;
}

export function validateWebAuthnProdEnv(opts?: {
  host?: string;
  wireAuthProd?: boolean;
}): WebAuthnEnvValidation[] {
  const host =
    opts?.host?.trim() ||
    process.env.STEWARD_CHAT_HOST?.trim() ||
    process.env.WIRE_CONSOLE_HOST?.trim() ||
    process.env.OPERATOR_CONSOLE_HOST?.trim();
  const wireProd =
    opts?.wireAuthProd ?? process.env.WIRE_CONSOLE_AUTH === "prod";
  const rpId = process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID?.trim() ?? "";
  const origin = process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN?.trim() ?? "";
  const publicHost = hostLooksPublic(host);
  const originHost = origin ? webAuthnOriginHost(origin) : null;
  const originHostname = origin ? webAuthnOriginHostname(origin) : null;

  const results: WebAuthnEnvValidation[] = [];

  if (wireProd) {
    results.push({
      ok: Boolean(rpId),
      detail: rpId
        ? `WebAuthn RP ID configured (${rpId})`
        : "WIRE_CONSOLE_WEBAUTHN_RP_ID required when WIRE_CONSOLE_AUTH=prod",
    });
    results.push({
      ok: Boolean(origin && originHost),
      detail:
        origin && originHost
          ? `WebAuthn origin configured (${trimOrigin(origin)})`
          : "WIRE_CONSOLE_WEBAUTHN_ORIGIN required — valid URL (https:// in production)",
    });
  }

  if (wireProd && origin) {
    const httpsOk = !publicHost || origin.startsWith("https://");
    results.push({
      ok: httpsOk,
      detail: publicHost && !httpsOk
        ? `Public host ${host} requires WIRE_CONSOLE_WEBAUTHN_ORIGIN=https://…`
        : publicHost
          ? "WebAuthn origin uses HTTPS"
          : "Local WebAuthn origin (http ok for localhost)",
    });

    if (rpId && originHostname) {
      const match =
        !publicHost && (originHostname === "localhost" || originHostname === "127.0.0.1")
          ? rpId === "localhost"
          : publicHost
            ? rpId === originHostname
            : rpId === originHostname || rpId === originHost;
      results.push({
        ok: match,
        detail: match
          ? "WebAuthn RP ID matches ceremony origin hostname (single RP)"
          : `WIRE_CONSOLE_WEBAUTHN_RP_ID (${rpId}) must match origin hostname (${originHostname})`,
      });
    }
  }

  const deprecatedSettlementRp = process.env.ORGOS_SETTLEMENT_RP_ID?.trim();
  results.push({
    ok: true,
    detail: deprecatedSettlementRp
      ? `WARN: ORGOS_SETTLEMENT_RP_ID=${deprecatedSettlementRp} is deprecated — unset; ceremony uses WIRE_CONSOLE_WEBAUTHN_RP_ID`
      : "No deprecated ORGOS_SETTLEMENT_RP_ID (single console RP)",
  });

  return results;
}
