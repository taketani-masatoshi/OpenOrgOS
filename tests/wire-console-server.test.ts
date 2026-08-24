import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { mintTestOidcIdToken, mintTestOidcIdTokenRs256, preloadOidcJwks } from "../src/lib/wire-console/auth/oidc.js";
import { resetOidcJwksForTests } from "../src/lib/wire-console/auth/oidc-jwks.js";
import { mintTestWebAuthnAssertion, mintTestWebAuthnRegistration, buildTestAuthenticatorData } from "../src/lib/wire-console/auth/webauthn-verify.js";
import {
  resetSessionsForTests,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { resetWebAuthnChallengesForTests } from "../src/lib/wire-console/auth/webauthn.js";
import { resetWebAuthnRegisterChallengesForTests } from "../src/lib/wire-console/auth/webauthn-register.js";
import { resetWebAuthnCredentialsForTests } from "../src/lib/wire-console/auth/webauthn-store.js";
import { listWireConsoleTenants } from "../src/lib/wire-console/tenant-registry.js";
import {
  resetWireConsoleTestTenant,
  WIRE_CONSOLE_TEST_TENANT,
} from "./helpers/wire-console-test-fixture.js";
import {
  removeWireConsoleWitnessPoolConfig,
  startWireConsoleWitnessHubs,
} from "./helpers/wire-console-witness-fixture.js";
import { writeWireConsoleWebAuthnSmokeFixture } from "./helpers/wire-console-webauthn-e2e-fixture.js";
import {
  mintPasskeyBootstrapToken,
  resetPasskeyBootstrapStoreForTests,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";

function setupOidcProdEnv(): void {
  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "oidc";
  process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://idp.test/orgos";
  process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "wire-console";
  process.env.WIRE_CONSOLE_OIDC_HS256_SECRET = "test-oidc-secret";
  delete process.env.WIRE_CONSOLE_OIDC_JWKS_JSON;
  delete process.env.WIRE_CONSOLE_OIDC_JWKS_URL;
}

describe("wire console server", () => {
  let close: (() => void) | undefined;
  const envSnapshot = {
    auth: process.env.WIRE_CONSOLE_AUTH,
    prodAdapter: process.env.WIRE_CONSOLE_PROD_ADAPTER,
    prodToken: process.env.WIRE_CONSOLE_PROD_TOKEN,
    oidcIssuer: process.env.WIRE_CONSOLE_OIDC_ISSUER,
    oidcAudience: process.env.WIRE_CONSOLE_OIDC_AUDIENCE,
    oidcSecret: process.env.WIRE_CONSOLE_OIDC_HS256_SECRET,
    oidcJwksJson: process.env.WIRE_CONSOLE_OIDC_JWKS_JSON,
    allowLegacy: process.env.WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN,
    includeTestTenants: process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS,
    webauthnCredentials: process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS,
    webauthnTestSecret: process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET,
    webauthnAllowTestSecret: process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET,
    webauthnRpId: process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID,
    webauthnE2e: process.env.WIRE_CONSOLE_E2E_WEBAUTHN,
    webauthnOrigin: process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN,
    oidcJwksUrl: process.env.WIRE_CONSOLE_OIDC_JWKS_URL,
    oidcAllowHs256: process.env.WIRE_CONSOLE_OIDC_ALLOW_HS256,
    orgosEnv: process.env.ORGOS_ENV,
    orgosCsrf: process.env.ORGOS_CSRF,
  };

  beforeEach(() => {
    delete process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS;
    process.env.ORGOS_CSRF = "0";
    resetWireConsoleTestTenant();
    resetOidcJwksForTests();
  });

  afterEach(() => {
    close?.();
    close = undefined;
    resetSessionsForTests();
    resetWebAuthnChallengesForTests();
    resetWebAuthnRegisterChallengesForTests();
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    resetOidcJwksForTests();
    const restore: Record<string, string | undefined> = {
      WIRE_CONSOLE_AUTH: envSnapshot.auth,
      WIRE_CONSOLE_PROD_ADAPTER: envSnapshot.prodAdapter,
      WIRE_CONSOLE_PROD_TOKEN: envSnapshot.prodToken,
      WIRE_CONSOLE_OIDC_ISSUER: envSnapshot.oidcIssuer,
      WIRE_CONSOLE_OIDC_AUDIENCE: envSnapshot.oidcAudience,
      WIRE_CONSOLE_OIDC_HS256_SECRET: envSnapshot.oidcSecret,
      WIRE_CONSOLE_OIDC_JWKS_JSON: envSnapshot.oidcJwksJson,
      WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN: envSnapshot.allowLegacy,
      WIRE_CONSOLE_INCLUDE_TEST_TENANTS: envSnapshot.includeTestTenants,
      WIRE_CONSOLE_WEBAUTHN_CREDENTIALS: envSnapshot.webauthnCredentials,
      WIRE_CONSOLE_WEBAUTHN_TEST_SECRET: envSnapshot.webauthnTestSecret,
      WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET: envSnapshot.webauthnAllowTestSecret,
      WIRE_CONSOLE_WEBAUTHN_RP_ID: envSnapshot.webauthnRpId,
      WIRE_CONSOLE_E2E_WEBAUTHN: envSnapshot.webauthnE2e,
      WIRE_CONSOLE_WEBAUTHN_ORIGIN: envSnapshot.webauthnOrigin,
      WIRE_CONSOLE_OIDC_JWKS_URL: envSnapshot.oidcJwksUrl,
      WIRE_CONSOLE_OIDC_ALLOW_HS256: envSnapshot.oidcAllowHs256,
      ORGOS_ENV: envSnapshot.orgosEnv,
      ORGOS_CSRF: envSnapshot.orgosCsrf,
    };
    for (const [key, val] of Object.entries(restore)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  async function loginDevCookie(
    base: string,
    opts?: { operator_id?: string; approver_id?: string },
  ): Promise<string> {
    const login = await fetch(`${base}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passkey: "orgos-dev",
        operator_id: opts?.operator_id ?? "OP-002",
        approver_id: opts?.approver_id ?? "Demo CEO",
      }),
    });
    return login.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  it("health returns ok", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
  });

  it("excludes test lifecycle tenant from operator tenant list", () => {
    const ids = listWireConsoleTenants().map((t) => t.id);
    expect(ids).not.toContain(WIRE_CONSOLE_TEST_TENANT);
    expect(ids).toContain("southwood");
  });

  it("includes test lifecycle tenant when WIRE_CONSOLE_INCLUDE_TEST_TENANTS=1", () => {
    process.env.WIRE_CONSOLE_INCLUDE_TEST_TENANTS = "1";
    const ids = listWireConsoleTenants().map((t) => t.id);
    expect(ids).toContain(WIRE_CONSOLE_TEST_TENANT);
  });

  it("login sets session and returns tenants", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);
    expect(cookie).toContain(WIRE_CONSOLE_SESSION_COOKIE);

    const tenants = await fetch(`${server.url}/console/v1/tenants`, { headers: { cookie } });
    expect(tenants.status).toBe(200);
    const body = (await tenants.json()) as { tenants: { id: string }[] };
    expect(body.tenants.some((t) => t.id === "southwood")).toBe(true);
    expect(body.tenants.some((t) => t.id === WIRE_CONSOLE_TEST_TENANT)).toBe(false);
  });

  it("returns test tenant snapshot and outbox when authenticated", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);

    const snapshot = await fetch(`${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/snapshot`, {
      headers: { cookie },
    });
    expect(snapshot.status).toBe(200);
    const snapBody = (await snapshot.json()) as { counts: { outbox: number; inbox: number } };
    expect(snapBody.counts.inbox).toBeGreaterThan(0);
    expect(snapBody.counts.outbox).toBeGreaterThan(0);
  });

  it("returns human mail messages and threads for test tenant", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);

    const messages = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/messages?folder=all`,
      { headers: { cookie } }
    );
    expect(messages.status).toBe(200);
    const msgBody = (await messages.json()) as {
      messages: { id: string; subject: string; folder: string }[];
    };
    expect(msgBody.messages.length).toBeGreaterThan(0);
    expect(msgBody.messages.some((m) => m.folder === "inbox")).toBe(true);

    const threads = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/threads?folder=all`,
      { headers: { cookie } }
    );
    expect(threads.status).toBe(200);
    const threadBody = (await threads.json()) as { threads: { thread_id: string; messages: unknown[] }[] };
    expect(threadBody.threads.length).toBeGreaterThan(0);

    const firstId = msgBody.messages.find((m) => m.folder === "outbox")!.id;
    const detail = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/messages/${firstId}`,
      { headers: { cookie } }
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { subject: string; body_text: string };
    expect(detailBody.subject.length).toBeGreaterThan(0);
    expect(detailBody.body_text.length).toBeGreaterThan(0);

    const pending = msgBody.messages.find((m) => m.folder === "pending");
    if (pending?.id.includes(":")) {
      const encodedId = encodeURIComponent(pending.id);
      const encodedDetail = await fetch(
        `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/messages/${encodedId}`,
        { headers: { cookie } }
      );
      expect(encodedDetail.status).toBe(200);
    }
  });

  it("serves settlement challenge API on wire console origin", async () => {
    process.env.ORGOS_SETTLEMENT_STEPUP = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "wire-console-settlement-test-secret";
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const unauth = await fetch(`${server.url}/chat/v1/settlement/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval_id: "NOTICE-000" }),
    });
    expect(unauth.status).toBe(401);
    const unauthBody = (await unauth.json()) as { error?: string };
    expect(unauthBody.error).toBe("unauthorized");
  });

  it("propose and approve wire notice on isolated test tenant", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const proposeCookie = await loginDevCookie(server.url, {
      operator_id: "OP-002",
      approver_id: "秘書オペレータ",
    });

    const propose = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/propose`,
      {
        method: "POST",
        headers: { cookie: proposeCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          peer_id: "PEER-001",
          transaction_type: "contract.execution.notice",
          contract_id: "CTR-099",
          message: "isolated wire console test",
        }),
      }
    );
    expect(propose.status).toBe(200);
    const proposed = (await propose.json()) as { notice: { notice_id: string } };

    const approveCookie = await loginDevCookie(server.url, {
      operator_id: "OP-001",
      approver_id: "Demo CEO",
    });
    const approve = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/${proposed.notice.notice_id}/approve`,
      {
        method: "POST",
        headers: { cookie: approveCookie, "Content-Type": "application/json" },
        body: "{}",
      }
    );
    expect(approve.status).toBe(200);
    const approved = (await approve.json()) as { notice: { status: string } };
    expect(approved.notice.status).toBe("transmitted");
  });

  it("returns auth config with prod adapter metadata", async () => {
    setupOidcProdEnv();
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/auth/config`);
    const body = (await res.json()) as {
      mode: string;
      prod_adapter: string;
      prod_default_adapter: string;
      legacy_token_deprecated: boolean;
    };
    expect(body.mode).toBe("prod");
    expect(body.prod_adapter).toBe("oidc");
    expect(body.prod_default_adapter).toBe("oidc");
    expect(body.legacy_token_deprecated).toBe(true);
  });

  it("blocks dev passkey when WIRE_CONSOLE_AUTH=prod", async () => {
    setupOidcProdEnv();
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev" }),
    });
    expect(res.status).toBe(403);
  });

  it("accepts OIDC id_token login in prod mode (HS256)", async () => {
    setupOidcProdEnv();
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const idToken = mintTestOidcIdToken({
      sub: "oidc-user",
      approver_id: "テスト承認者",
    });
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "テスト承認者" }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { user: { mode: string } };
    expect(body.user.mode).toBe("prod");
  });

  it("accepts OIDC id_token login in prod mode (RS256 + JWKS JSON)", async () => {
    setupOidcProdEnv();
    delete process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    jwk.kid = "test-rsa";
    process.env.WIRE_CONSOLE_OIDC_JWKS_JSON = JSON.stringify({ keys: [jwk] });
    await preloadOidcJwks();

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const idToken = mintTestOidcIdTokenRs256(privateKey, {
      sub: "oidc-rs256",
      kid: "test-rsa",
      approver_id: "テスト承認者",
    });
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "テスト承認者" }),
    });
    expect(login.status).toBe(200);
  });

  it("accepts OIDC id_token login in prod mode (RS256 + JWKS URL)", async () => {
    setupOidcProdEnv();
    delete process.env.WIRE_CONSOLE_OIDC_HS256_SECRET;
    delete process.env.WIRE_CONSOLE_OIDC_JWKS_JSON;
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    jwk.kid = "url-rsa";
    const { createServer } = await import("node:http");
    const jwksServer = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const addr = jwksServer.address();
    const jwksPort = typeof addr === "object" && addr ? addr.port : 0;
    process.env.WIRE_CONSOLE_OIDC_JWKS_URL = `http://127.0.0.1:${jwksPort}/jwks`;
    resetOidcJwksForTests();
    await preloadOidcJwks();

    const server = await startWireConsoleServer({ port: 0 });
    close = () => {
      server.close();
      jwksServer.close();
    };
    const idToken = mintTestOidcIdTokenRs256(privateKey, {
      sub: "oidc-jwks-url",
      kid: "url-rsa",
      approver_id: "テスト承認者",
    });
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "テスト承認者" }),
    });
    expect(login.status).toBe(200);
  });

  it("rejects HS256 id_token in prod when JWKS is configured", async () => {
    setupOidcProdEnv();
    const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    jwk.kid = "block-hs256";
    process.env.WIRE_CONSOLE_OIDC_JWKS_JSON = JSON.stringify({ keys: [jwk] });
    resetOidcJwksForTests();
    await preloadOidcJwks();
    const idToken = mintTestOidcIdToken({ sub: "hs256-blocked", approver_id: "テスト承認者" });
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "テスト承認者" }),
    });
    expect(login.status).toBe(401);
    const body = (await login.json()) as { error: string };
    expect(body.error).toContain("HS256");
  });

  it("rejects deprecated prod_token unless explicitly allowed", async () => {
    setupOidcProdEnv();
    process.env.WIRE_CONSOLE_PROD_TOKEN = "legacy-token";
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prod_token: "legacy-token",
        operator_id: "ops",
        approver_id: "テスト承認者",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("accepts WebAuthn login in prod mode with test signature (vitest only)", async () => {
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET = "1";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS = JSON.stringify([
      {
        credential_id: "test-cred",
        public_key_spki_base64: "dummy",
        operator_id: "WebAuthn Ops",
        approver_id: "テスト承認者",
      },
    ]);
    process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET = "webauthn-test-secret";

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const options = await fetch(`${server.url}/console/v1/auth/webauthn/options`, {
      method: "POST",
    });
    const opts = (await options.json()) as { challenge: string };
    const clientDataJson = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: opts.challenge,
        origin: "http://localhost:9470",
      })
    ).toString("base64url");
    const authenticatorDataBase64 = buildTestAuthenticatorData("localhost").toString("base64url");

    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webauthn: {
          credential_id: "test-cred",
          challenge: opts.challenge,
          client_data_json: clientDataJson,
          authenticator_data_base64: authenticatorDataBase64,
          signature_base64: Buffer.from("webauthn-test-secret").toString("base64url"),
        },
      }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { user: { operator_id: string; mode: string } };
    expect(body.user.operator_id).toBe("WebAuthn Ops");
    expect(body.user.mode).toBe("prod");
  });

  it("accepts WebAuthn login with cryptographic assertion verification", async () => {
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "127.0.0.1";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "https://127.0.0.1";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const options = await fetch(`${server.url}/console/v1/auth/webauthn/options`, {
      method: "POST",
    });
    const opts = (await options.json()) as { challenge: string };
    const assertion = mintTestWebAuthnAssertion({
      rpId: "127.0.0.1",
      challenge: opts.challenge,
      credentialId: "crypto-cred",
      origin: "https://127.0.0.1",
    });
    process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS = JSON.stringify([
      {
        credential_id: assertion.credential_id,
        public_key_spki_base64: assertion.public_key_spki_base64,
        operator_id: "Crypto Ops",
        approver_id: "テスト承認者",
      },
    ]);

    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webauthn: {
          credential_id: assertion.credential_id,
          challenge: opts.challenge,
          client_data_json: assertion.client_data_json,
          authenticator_data_base64: assertion.authenticator_data_base64,
          signature_base64: assertion.signature_base64,
        },
      }),
    });
    expect(login.status).toBe(200);
    const body = (await login.json()) as { user: { operator_id: string } };
    expect(body.user.operator_id).toBe("Crypto Ops");
  });

  it("completes WebAuthn e2e login when WIRE_CONSOLE_E2E_WEBAUTHN=1", async () => {
    resetWebAuthnChallengesForTests();
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_E2E_WEBAUTHN = "1";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;

    const fixture = writeWireConsoleWebAuthnSmokeFixture();
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9473";

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const config = await fetch(`${server.url}/console/v1/auth/config`);
    const cfg = (await config.json()) as { webauthn_e2e_login?: boolean };
    expect(cfg.webauthn_e2e_login).toBe(true);

    const options = await fetch(`${server.url}/console/v1/auth/webauthn/options`, {
      method: "POST",
    });
    const opts = (await options.json()) as { challenge: string };

    const complete = await fetch(`${server.url}/console/v1/auth/webauthn/e2e-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: opts.challenge }),
    });
    expect(complete.status).toBe(200);
    const body = (await complete.json()) as { user: { operator_id: string; approver_id: string } };
    expect(body.user.operator_id).toBe(fixture.operator_id);
    expect(body.user.approver_id).toBe(fixture.approver_id);
  });

  it("registers passkey via API and logs in with cryptographic assertion", async () => {
    resetWebAuthnChallengesForTests();
    resetWebAuthnRegisterChallengesForTests();
    resetWebAuthnCredentialsForTests();
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://idp.test/orgos";
    process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "wire-console";
    process.env.WIRE_CONSOLE_OIDC_HS256_SECRET = "test-oidc-secret";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const config = await fetch(`${server.url}/console/v1/auth/config`);
    const cfg = (await config.json()) as {
      webauthn?: {
        credential_count: number;
        settlement_count?: number;
        registration_allowed?: boolean;
      };
    };
    expect(cfg.webauthn?.registration_allowed).toBe(true);
    expect(cfg.webauthn?.credential_count).toBe(0);

    const idToken = mintTestOidcIdToken({
      sub: "OP-001",
      operator_id: "OP-001",
      approver_id: "Demo CEO",
    });
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "Demo CEO" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";

    const regOptions = await fetch(`${server.url}/console/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ operator_id: "OP-001", approver_id: "Demo CEO" }),
    });
    expect(regOptions.status).toBe(200);
    const regOpts = (await regOptions.json()) as { challenge: string };
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const registration = mintTestWebAuthnRegistration({
      rpId: "localhost",
      origin: "http://localhost:9470",
      challenge: regOpts.challenge,
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      privateKey,
    });

    const register = await fetch(`${server.url}/console/v1/auth/webauthn/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        challenge: regOpts.challenge,
        credential_id: registration.credential_id,
        client_data_json: registration.client_data_json,
        attestation_object_base64: registration.attestation_object_base64,
        operator_id: "OP-001",
        approver_id: "Demo CEO",
      }),
    });
    expect(register.status).toBe(200);

    const loginOptions = await fetch(`${server.url}/console/v1/auth/webauthn/options`, {
      method: "POST",
    });
    const loginOpts = (await loginOptions.json()) as { challenge: string };
    const assertion = mintTestWebAuthnAssertion({
      rpId: "localhost",
      origin: "http://localhost:9470",
      challenge: loginOpts.challenge,
      credentialId: registration.credential_id,
      privateKey,
    });

    const loginWebAuthn = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webauthn: {
          credential_id: registration.credential_id,
          challenge: loginOpts.challenge,
          client_data_json: assertion.client_data_json,
          authenticator_data_base64: assertion.authenticator_data_base64,
          signature_base64: assertion.signature_base64,
        },
      }),
    });
    expect(loginWebAuthn.status).toBe(200);
    const body = (await loginWebAuthn.json()) as { user: { operator_id: string } };
    expect(body.user.operator_id).toBe("OP-001");
  });

  it("requires bootstrap token for first passkey registration in production", async () => {
    resetWebAuthnChallengesForTests();
    resetWebAuthnRegisterChallengesForTests();
    resetWebAuthnCredentialsForTests();
    resetPasskeyBootstrapStoreForTests();
    process.env.ORGOS_ENV = "production";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "test-settlement-challenge-secret";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    setupOidcProdEnv();
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    delete process.env.WIRE_CONSOLE_E2E_WEBAUTHN;
    const { token } = mintPasskeyBootstrapToken({ operatorId: "OP-001" });

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const idToken = mintTestOidcIdToken({
      sub: "OP-001",
      operator_id: "OP-001",
      approver_id: "Demo CEO",
    });
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken, approver_id: "Demo CEO" }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";

    const withoutToken = await fetch(`${server.url}/console/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ operator_id: "OP-001", approver_id: "Demo CEO" }),
    });
    expect(withoutToken.status).toBeGreaterThanOrEqual(400);

    const regOptions = await fetch(`${server.url}/console/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        bootstrap_token: token,
      }),
    });
    expect(regOptions.status).toBe(200);
    const regOpts = (await regOptions.json()) as { challenge: string };
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const registration = mintTestWebAuthnRegistration({
      rpId: "localhost",
      origin: "http://localhost:9470",
      challenge: regOpts.challenge,
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      privateKey,
    });
    const register = await fetch(`${server.url}/console/v1/auth/webauthn/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        challenge: regOpts.challenge,
        credential_id: registration.credential_id,
        client_data_json: registration.client_data_json,
        attestation_object_base64: registration.attestation_object_base64,
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        bootstrap_token: token,
      }),
    });
    expect(register.status).toBe(200);
  });

  it("registers settlement passkey via console API with authenticated session", async () => {
    resetWebAuthnChallengesForTests();
    resetWebAuthnRegisterChallengesForTests();
    resetWebAuthnCredentialsForTests();
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET = "1";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET = "webauthn-test-secret";
    process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS = JSON.stringify([
      {
        credential_id: "login-cred-settlement",
        public_key_spki_base64: "dummy",
        operator_id: "OP-001",
        approver_id: "Demo CEO",
      },
    ]);

    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;

    const options = await fetch(`${server.url}/console/v1/auth/webauthn/options`, {
      method: "POST",
    });
    const opts = (await options.json()) as { challenge: string };
    const clientDataJson = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: opts.challenge,
        origin: "http://localhost:9470",
      }),
    ).toString("base64url");
    const authenticatorDataBase64 = buildTestAuthenticatorData("localhost").toString("base64url");
    const login = await fetch(`${server.url}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webauthn: {
          credential_id: "login-cred-settlement",
          challenge: opts.challenge,
          client_data_json: clientDataJson,
          authenticator_data_base64: authenticatorDataBase64,
          signature_base64: Buffer.from("webauthn-test-secret").toString("base64url"),
        },
      }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie") ?? "";

    const regOptions = await fetch(`${server.url}/console/v1/auth/webauthn/register/options`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "settlement",
      }),
    });
    expect(regOptions.status).toBe(200);
    const regOpts = (await regOptions.json()) as { challenge: string };
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const registration = mintTestWebAuthnRegistration({
      rpId: "localhost",
      origin: "http://localhost:9470",
      challenge: regOpts.challenge,
      operator_id: "OP-001",
      approver_id: "Demo CEO",
      privateKey,
    });
    const register = await fetch(`${server.url}/console/v1/auth/webauthn/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        challenge: regOpts.challenge,
        credential_id: registration.credential_id,
        client_data_json: registration.client_data_json,
        attestation_object_base64: registration.attestation_object_base64,
        operator_id: "OP-001",
        approver_id: "Demo CEO",
        purpose: "settlement",
      }),
    });
    expect(register.status).toBe(200);
    const body = (await register.json()) as { purpose?: string; credential_id?: string };
    expect(body.purpose).toBe("settlement");
    expect(body.credential_id).toBeTruthy();
  });

  it("registers and verifies witness attestation via console API", async () => {
    resetWireConsoleTestTenant();
    const witness = await startWireConsoleWitnessHubs();
    const server = await startWireConsoleServer({ port: 0 });
    close = () => {
      server.close();
      witness.close();
      removeWireConsoleWitnessPoolConfig();
    };
    const proposeCookie = await loginDevCookie(server.url, {
      operator_id: "OP-002",
      approver_id: "秘書オペレータ",
    });

    const propose = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/propose`,
      {
        method: "POST",
        headers: { cookie: proposeCookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          peer_id: "PEER-001",
          transaction_type: "contract.execution.notice",
          contract_id: "CTR-099",
        }),
      }
    );
    const proposed = (await propose.json()) as { notice: { notice_id: string } };
    const approveCookie = await loginDevCookie(server.url, {
      operator_id: "OP-001",
      approver_id: "Demo CEO",
    });
    const approve = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/${proposed.notice.notice_id}/approve`,
      {
        method: "POST",
        headers: { cookie: approveCookie, "Content-Type": "application/json" },
        body: "{}",
      }
    );
    const approved = (await approve.json()) as { transmission: { event_id: string } };
    const eventId = approved.transmission.event_id;

    for (const side of ["sent", "received"] as const) {
      const register = await fetch(
        `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/witness/register`,
        {
          method: "POST",
          headers: { cookie: approveCookie, "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: eventId, side }),
        }
      );
      expect(register.status).toBe(200);
    }

    const verify = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/witness/verify`,
      {
        method: "POST",
        headers: { cookie: approveCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId }),
      }
    );
    expect(verify.status).toBe(200);
    const verifyBody = (await verify.json()) as { quorum: { satisfied: boolean } };
    expect(verifyBody.quorum.satisfied).toBe(true);
  });

  it("streams SSE snapshot events when authenticated", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);
    const res = await fetch(`${server.url}/console/v1/events/stream`, {
      headers: { cookie, Accept: "text/event-stream" },
    });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("event: snapshot");
    await reader.cancel();
  });
});
