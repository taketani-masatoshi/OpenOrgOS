import { createDevSession, registerSession, type WireConsoleUser } from "./session.js";
import { createProdSession } from "./prod.js";
import {
  getWireConsoleAuthConfig,
  isLegacyProdTokenAllowed,
  wireConsoleAuthMode,
  wireConsoleProdAdapter,
} from "./mode.js";
import { getOidcConfig, verifyOidcIdToken } from "./oidc.js";
import { createWebAuthnLoginOptions, getWebAuthnConfig, verifyWebAuthnLogin } from "./webauthn.js";
import { isWebAuthnE2eLoginEnabled } from "./webauthn-e2e.js";

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

export function authenticateWireConsoleLogin(body: WireConsoleLoginBody):
  | { token: string; user: WireConsoleUser; deprecated?: string }
  | {
      error: string;
      status: number;
    } {
  const mode = wireConsoleAuthMode();

  if (mode === "prod") {
    if (body.passkey) {
      return { error: "dev passkey login disabled in prod mode", status: 403 };
    }

    if (body.prod_token) {
      if (!isLegacyProdTokenAllowed()) {
        return {
          error:
            "prod_token is deprecated — use OIDC id_token or WebAuthn (set WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN=1 to override)",
          status: 403,
        };
      }
      if (!body.operator_id || !body.approver_id) {
        return {
          error: "operator_id and approver_id required with legacy prod_token",
          status: 422,
        };
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
      if (!body.id_token) {
        return { error: "id_token required for OIDC prod login", status: 422 };
      }
      const verified = verifyOidcIdToken(body.id_token, { approver_id: body.approver_id });
      if ("error" in verified) {
        return { error: verified.error, status: 401 };
      }
      return registerSession({
        operator_id: verified.operator_id,
        approver_id: verified.approver_id,
        mode: "prod",
      });
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
    return { error: "passkey required", status: 422 };
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
  return {
    ...base,
    oidc: base.mode === "prod" ? oidc : undefined,
    webauthn: base.mode === "prod" ? webauthn : undefined,
    webauthn_e2e_login: base.mode === "prod" && isWebAuthnE2eLoginEnabled(),
  };
}

export { createWebAuthnLoginOptions, getWireConsoleAuthConfig };
