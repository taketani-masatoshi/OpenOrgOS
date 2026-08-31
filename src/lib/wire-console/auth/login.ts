import { createDevSession, registerSession, type WireConsoleUser } from "./session.js";
import { createProdSession } from "./prod.js";
import {
  getWireConsoleAuthConfig,
  isDevLoginAllowed,
  isLegacyProdTokenAllowed,
  wireConsoleAuthMode,
  wireConsoleProdAdapter,
} from "./mode.js";
import { getOidcConfig, verifyOidcIdToken } from "./oidc.js";
import {
  createWebAuthnLoginOptions,
  getWebAuthnConfig,
  verifyWebAuthnLogin,
} from "./webauthn.js";
import { isWebAuthnE2eLoginEnabled } from "./webauthn-e2e.js";
import { loginBootstrapIdentity } from "../../org/operators.js";

export interface WireConsoleLoginBody {
  passkey?: string;
  prod_token?: string;
  id_token?: string;
  operator_id?: string;
  approver_id?: string;
  webauthn?: {
    credential_id: string;
    challenge: string;
    client_data_json: string;
    authenticator_data_base64?: string;
    signature_base64?: string;
  };
}

function sessionFromOidcIdToken(
  idToken: string,
  opts?: { approver_id?: string }
): { token: string; user: WireConsoleUser } | { error: string; status: number } {
  const verified = verifyOidcIdToken(idToken, opts);
  if ("error" in verified) {
    return { error: verified.error, status: 401 };
  }
  const mode = wireConsoleAuthMode();
  return registerSession({
    operator_id: verified.operator_id,
    approver_id: verified.approver_id,
    mode: mode === "prod" ? "prod" : "dev",
  });
}

export function authenticateWireConsoleLogin(
  body: WireConsoleLoginBody
): { token: string; user: WireConsoleUser; deprecated?: string } | {
  error: string;
  status: number;
} {
  const mode = wireConsoleAuthMode();

  // Community SSO handoff (and generic OIDC) — allowed in both auth modes.
  if (body.id_token) {
    return sessionFromOidcIdToken(body.id_token, { approver_id: body.approver_id });
  }

  // Issued login PassKeys work after logout in both dev and prod.
  if (body.webauthn) {
    const result = verifyWebAuthnLogin(body.webauthn);
    if ("error" in result) {
      return { error: result.error, status: 401 };
    }
    return result;
  }

  // Local / early bootstrap: ID + password even when WIRE_CONSOLE_AUTH=prod (PassKey secondary).
  if (body.passkey && isDevLoginAllowed()) {
    const result = createDevSession({
      passkey: body.passkey,
      operator_id: body.operator_id,
      approver_id: body.approver_id,
    });
    if ("error" in result) {
      return { error: result.error, status: 401 };
    }
    return result;
  }

  if (mode === "prod") {
    if (body.passkey) {
      return { error: "dev passkey login disabled in prod mode", status: 403 };
    }

    if (body.prod_token) {
      if (!isLegacyProdTokenAllowed()) {
        return {
          error: "prod_token is deprecated — use OIDC id_token or WebAuthn (set WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN=1 to override)",
          status: 403,
        };
      }
      if (!body.operator_id || !body.approver_id) {
        return { error: "operator_id and approver_id required with legacy prod_token", status: 422 };
      }
      const result = createProdSession({
        prod_token: body.prod_token,
        operator_id: body.operator_id,
        approver_id: body.approver_id,
      });
      if ("error" in result) {
        return { error: result.error, status: 401 };
      }
      return {
        ...result,
        deprecated: "prod_token login is deprecated — migrate to OIDC or WebAuthn",
      };
    }

    const adapter = wireConsoleProdAdapter();

    if (adapter === "oidc") {
      return { error: "id_token required for OIDC prod login", status: 422 };
    }

    if (adapter === "webauthn") {
      if (!body.webauthn) {
        return { error: "webauthn payload required", status: 422 };
      }
      const result = verifyWebAuthnLogin(body.webauthn);
      if ("error" in result) {
        return { error: result.error, status: 401 };
      }
      return result;
    }

    return { error: "prod login requires id_token (OIDC) or webauthn payload", status: 422 };
  }

  if (!body.passkey) {
    return { error: "passkey, webauthn, or id_token required", status: 422 };
  }
  const result = createDevSession({
    passkey: body.passkey,
    operator_id: body.operator_id,
    approver_id: body.approver_id,
  });
  if ("error" in result) {
    return { error: result.error, status: 401 };
  }
  return result;
}

export function getWireConsoleAuthConfigResponse() {
  const base = getWireConsoleAuthConfig();
  const oidc = getOidcConfig();
  const webauthn = getWebAuthnConfig();
  const oidcReady = Boolean(oidc.issuer && oidc.audience && (oidc.hs256_configured || oidc.jwks_configured));
  return {
    ...base,
    // Expose OIDC when configured so SPAs know Community handoff is available in dev too.
    oidc: oidcReady ? oidc : base.mode === "prod" ? oidc : undefined,
    webauthn,
    webauthn_e2e_login: base.mode === "prod" && isWebAuthnE2eLoginEnabled(),
    community_handoff: oidcReady,
    login_defaults: loginBootstrapIdentity(),
  };
}

export { createWebAuthnLoginOptions, getWireConsoleAuthConfig };
