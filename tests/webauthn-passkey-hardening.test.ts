import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isCsrfExemptPath } from "../src/lib/console-auth/csrf.js";
import { setSessionCookie } from "../src/lib/wire-console/auth/session.js";
import { revokePasskeyForSession } from "../src/lib/wire-console/auth/webauthn-credentials-api.js";
import {
  mintPasskeyBootstrapToken,
  resetPasskeyBootstrapStoreForTests,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import {
  resetEnvManagedSignCountsForTests,
} from "../src/lib/wire-console/auth/webauthn-env-sign-count.js";
import {
  resetWebAuthnCredentialsForTests,
  setWebAuthnCredentialsForTests,
  updateWebAuthnSignCount,
  findWebAuthnCredential,
} from "../src/lib/wire-console/auth/webauthn-store.js";
import { verifyWebAuthnAssertion } from "../src/lib/wire-console/auth/webauthn-assertion.js";
import {
  buildTestAuthenticatorData,
  mintTestWebAuthnAssertion,
} from "../src/lib/wire-console/auth/webauthn-verify.js";
import { resetWireConsoleTestTenant } from "./helpers/wire-console-test-fixture.js";

describe("passkey hardening", () => {
  const session = {
    operator_id: "OP-001",
    approver_id: "Demo CEO",
    mode: "prod" as const,
  };
  const env = { ...process.env };

  beforeEach(() => {
    resetWireConsoleTestTenant();
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    resetEnvManagedSignCountsForTests();
  });

  afterEach(() => {
    process.env = { ...env };
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    resetEnvManagedSignCountsForTests();
  });

  it("csrf exempts ceremony paths but not credential revoke", () => {
    expect(isCsrfExemptPath("/chat/v1/auth/webauthn/register/options")).toBe(true);
    expect(isCsrfExemptPath("/console/v1/auth/webauthn/credentials/cred-1")).toBe(false);
  });

  it("sets Secure on session cookie when ORGOS_COOKIE_SECURE=1", () => {
    process.env.ORGOS_COOKIE_SECURE = "1";
    const headers: Record<string, string | string[] | undefined> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    setSessionCookie(res, "abc");
    expect(String(headers["Set-Cookie"])).toContain("Secure");
  });

  it("omits Secure on loopback HTTP even when ORGOS_COOKIE_SECURE=1", () => {
    process.env.ORGOS_COOKIE_SECURE = "1";
    const headers: Record<string, string | string[] | undefined> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    const req = { headers: { host: "127.0.0.1:9470" } } as IncomingMessage;
    setSessionCookie(res, "abc", req);
    expect(String(headers["Set-Cookie"])).toContain("orgos_wire_session=");
    expect(String(headers["Set-Cookie"])).not.toContain("Secure");
  });

  it("keeps Secure for the public operator host", () => {
    process.env.ORGOS_COOKIE_SECURE = "1";
    const headers: Record<string, string | string[] | undefined> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    const req = { headers: { host: "operator.oorgos.org" } } as IncomingMessage;
    setSessionCookie(res, "abc", req);
    expect(String(headers["Set-Cookie"])).toContain("Secure");
  });

  it("omits Secure when X-Forwarded-Host is loopback", () => {
    process.env.ORGOS_COOKIE_SECURE = "1";
    const headers: Record<string, string | string[] | undefined> = {};
    const res = {
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    const req = {
      headers: {
        host: "operator.oorgos.org",
        "x-forwarded-host": "localhost:9470",
      },
    } as IncomingMessage;
    setSessionCookie(res, "abc", req);
    expect(String(headers["Set-Cookie"])).not.toContain("Secure");
  });

  it("blocks revoking the only login passkey in production without bootstrap token", () => {
    process.env.ORGOS_ENV = "production";
    setWebAuthnCredentialsForTests([
      {
        credential_id: "only-login",
        public_key_spki_base64: "x",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
      },
    ]);
    const result = revokePasskeyForSession(session, "only-login");
    expect(result).toMatchObject({ status: 403 });
  });

  it("allows revoking the only login passkey when unused bootstrap token exists", () => {
    process.env.ORGOS_ENV = "production";
    mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    setWebAuthnCredentialsForTests([
      {
        credential_id: "only-login",
        public_key_spki_base64: "x",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
      },
    ]);
    expect(revokePasskeyForSession(session, "only-login")).toEqual({ ok: true });
  });

  it("tracks env-managed credential sign counts in sidecar", () => {
    process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS = JSON.stringify([
      {
        credential_id: "env-cred",
        public_key_spki_base64: "pk",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "login",
        sign_count: 0,
      },
    ]);
    updateWebAuthnSignCount("env-cred", 5);
    expect(findWebAuthnCredential("env-cred")?.sign_count).toBe(5);
  });

  it("rejects UV=0 even when skipSignatureVerification is set", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      challenge: "chal",
      credentialId: "cred-1",
      origin: "http://localhost:9470",
    });
    const upOnly = buildTestAuthenticatorData("localhost");
    upOnly[32] = 0x01;
    const result = verifyWebAuthnAssertion({
      expectedRpId: "localhost",
      expectedOrigin: "http://localhost:9470",
      clientDataJsonBase64: assertion.client_data_json,
      authenticatorDataBase64: upOnly.toString("base64url"),
      signatureBase64: assertion.signature_base64,
      publicKeySpkiBase64: assertion.public_key_spki_base64,
      skipSignatureVerification: true,
    });
    expect(result.ok).toBe(false);
  });
});
