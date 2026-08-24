import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { StewardChatServerHandle } from "../src/lib/steward-chat/server.js";
import { verifyWebAuthnAssertion } from "../src/lib/wire-console/auth/webauthn-assertion.js";
import { mintTestWebAuthnAssertion } from "../src/lib/wire-console/auth/webauthn-verify.js";
import { startStewardChatForTest } from "./helpers/steward-chat-test-server.js";
import { setTenantId } from "../src/lib/tenant.js";
import {
  mintPasskeyBootstrapToken,
  resetPasskeyBootstrapStoreForTests,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { mintTestOidcIdToken } from "../src/lib/wire-console/auth/oidc.js";
import { resetWebAuthnCredentialsForTests } from "../src/lib/wire-console/auth/webauthn-store.js";
import { resetWireConsoleTestTenant } from "./helpers/wire-console-test-fixture.js";

describe("passkey bootstrap HTTP", () => {
  let handle: StewardChatServerHandle | undefined;
  const env = { ...process.env };

  beforeEach(() => {
    resetWireConsoleTestTenant();
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    setTenantId("demo");
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_SESSION_PERSIST = "0";
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "127.0.0.1";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://127.0.0.1:9471";
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!handle) return resolve();
      handle.close(() => resolve());
      handle = undefined;
    });
    process.env = { ...env };
    resetPasskeyBootstrapStoreForTests();
    resetWebAuthnCredentialsForTests();
  });

  async function startProd() {
    process.env.ORGOS_ENV = "production";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.ORGOS_SESSION_PERSIST = "1";
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "test-settlement-hmac-secret";
    process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://idp.test/orgos";
    process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "wire-console";
    process.env.WIRE_CONSOLE_OIDC_HS256_SECRET = "test-oidc-secret";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    handle = await startStewardChatForTest();
    return handle.url;
  }

  async function prodSessionCookie(baseUrl: string): Promise<string> {
    const idToken = mintTestOidcIdToken({
      sub: "OP-001",
      operator_id: "OP-001",
      approver_id: "Demo CEO",
    });
    const login = await fetch(`${baseUrl}/chat/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "Demo CEO" }),
    });
    expect(login.status).toBe(200);
    return login.headers.get("set-cookie") ?? "";
  }

  it("returns 401 for register/options without bootstrap token in production", async () => {
    const baseUrl = await startProd();
    const cookie = await prodSessionCookie(baseUrl);
    const res = await fetch(`${baseUrl}/chat/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ operator_id: "OP-001", approver_id: "Demo CEO" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts register/options when bootstrap_token is posted in production", async () => {
    const baseUrl = await startProd();
    const cookie = await prodSessionCookie(baseUrl);
    resetPasskeyBootstrapStoreForTests();
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });
    const res = await fetch(`${baseUrl}/chat/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        bootstrap_token: token,
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge?: string };
    expect(body.challenge).toBeTruthy();
  });

  it("rejects bootstrap token for another operator", async () => {
    const baseUrl = await startProd();
    const cookie = await prodSessionCookie(baseUrl);
    resetPasskeyBootstrapStoreForTests();
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-002" });
    const res = await fetch(`${baseUrl}/chat/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        bootstrap_token: token,
      }),
    });
    expect(res.status).toBe(403);
  });
});

describe("webauthn register client bootstrap body", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("includes bootstrap_token in register/options JSON body", async () => {
    const posted: string[] = [];
    vi.doMock("../apps/shared/webauthn-simple.js", () => ({
      browserSupportsWebAuthn: () => true,
      createPasskeyWithSimpleWebAuthn: async () => ({
        rawId: "cred-id",
        response: {
          clientDataJSON: "e30",
          attestationObject: "e30",
        },
      }),
    }));
    const { registerLoginPasskey } = await import("../apps/shared/webauthn-register-client.js");
    await registerLoginPasskey(
      async (_path, init) => {
        if (init?.body) posted.push(String(init.body));
        return {
          ok: true,
          challenge: "chal",
          rp: { id: "localhost", name: "OrgOS" },
          user: { id: "u", name: "n", displayName: "d" },
          pub_key_cred_params: [{ type: "public-key", alg: -7 }],
          timeout: 60_000,
          exclude_credentials: [],
          authenticator_selection: { residentKey: "preferred", userVerification: "required" },
        };
      },
      {
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        bootstrap_token: "pkb_test_token",
        optionsPath: "/options",
        registerPath: "/register",
      },
    );
    expect(JSON.parse(posted[0]!)).toMatchObject({
      operator_id: "OP-001",
      bootstrap_token: "pkb_test_token",
    });
  });
});

function buildAuthDataWithSignCount(rpId: string, signCount: number, flags = 0x05): Buffer {
  const rpIdHash = createHash("sha256").update(rpId).digest();
  const buf = Buffer.alloc(37);
  rpIdHash.copy(buf, 0);
  buf[32] = flags;
  buf.writeUInt32BE(signCount, 33);
  return buf;
}

describe("env-managed sign count replay", () => {
  it("rejects assertion when sign count does not increase", () => {
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      challenge: "chal",
      credentialId: "cred-1",
      origin: "http://localhost:9470",
    });
    const authData = buildAuthDataWithSignCount("localhost", 5);
    const result = verifyWebAuthnAssertion({
      expectedRpId: "localhost",
      expectedOrigin: "http://localhost:9470",
      clientDataJsonBase64: assertion.client_data_json,
      authenticatorDataBase64: authData.toString("base64url"),
      signatureBase64: assertion.signature_base64,
      publicKeySpkiBase64: assertion.public_key_spki_base64,
      previousSignCount: 5,
      skipSignatureVerification: true,
    });
    expect(result.ok).toBe(false);
  });
});
