import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startWireConsoleServer } from "../src/lib/wire-console/server.js";
import { mintTestOidcIdToken } from "../src/lib/wire-console/auth/oidc.js";
import {
  resetSessionsForTests,
  WIRE_CONSOLE_SESSION_COOKIE,
} from "../src/lib/wire-console/auth/session.js";
import { resetWebAuthnChallengesForTests } from "../src/lib/wire-console/auth/webauthn.js";
import { listWireConsoleTenants } from "../src/lib/wire-console/tenant-registry.js";
import {
  resetWireConsoleTestTenant,
  WIRE_CONSOLE_TEST_TENANT,
} from "./helpers/wire-console-test-fixture.js";

function setupOidcProdEnv(): void {
  process.env.WIRE_CONSOLE_AUTH = "prod";
  process.env.WIRE_CONSOLE_PROD_ADAPTER = "oidc";
  process.env.WIRE_CONSOLE_OIDC_ISSUER = "https://idp.test/orgos";
  process.env.WIRE_CONSOLE_OIDC_AUDIENCE = "wire-console";
  process.env.WIRE_CONSOLE_OIDC_HS256_SECRET = "test-oidc-secret";
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
    allowLegacy: process.env.WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN,
  };

  beforeEach(() => {
    resetWireConsoleTestTenant();
  });

  afterEach(() => {
    close?.();
    close = undefined;
    resetSessionsForTests();
    resetWebAuthnChallengesForTests();
    const restore: Record<string, string | undefined> = {
      WIRE_CONSOLE_AUTH: envSnapshot.auth,
      WIRE_CONSOLE_PROD_ADAPTER: envSnapshot.prodAdapter,
      WIRE_CONSOLE_PROD_TOKEN: envSnapshot.prodToken,
      WIRE_CONSOLE_OIDC_ISSUER: envSnapshot.oidcIssuer,
      WIRE_CONSOLE_OIDC_AUDIENCE: envSnapshot.oidcAudience,
      WIRE_CONSOLE_OIDC_HS256_SECRET: envSnapshot.oidcSecret,
      WIRE_CONSOLE_ALLOW_LEGACY_PROD_TOKEN: envSnapshot.allowLegacy,
    };
    for (const [key, val] of Object.entries(restore)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  async function loginDevCookie(base: string, approver = "テスト承認者"): Promise<string> {
    const login = await fetch(`${base}/console/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkey: "orgos-dev", approver_id: approver }),
    });
    return login.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  it("health returns ok", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const res = await fetch(`${server.url}/health`);
    expect(res.status).toBe(200);
  });

  it("lists wire_console tenants including isolated test tenant", () => {
    const ids = listWireConsoleTenants().map((t) => t.id);
    expect(ids).toContain(WIRE_CONSOLE_TEST_TENANT);
    expect(ids).toContain("southwood");
  });

  it("login sets session and returns tenants", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);
    expect(cookie).toContain(WIRE_CONSOLE_SESSION_COOKIE);

    const tenants = await fetch(`${server.url}/console/v1/tenants`, { headers: { cookie } });
    expect(tenants.status).toBe(200);
    const body = (await tenants.json()) as { tenants: { id: string }[] };
    expect(body.tenants.some((t) => t.id === WIRE_CONSOLE_TEST_TENANT)).toBe(true);
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

  it("propose and approve wire notice on isolated test tenant", async () => {
    const server = await startWireConsoleServer({ port: 0 });
    close = server.close;
    const cookie = await loginDevCookie(server.url);

    const propose = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/propose`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
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

    const approve = await fetch(
      `${server.url}/console/v1/tenants/${WIRE_CONSOLE_TEST_TENANT}/notices/${proposed.notice.notice_id}/approve`,
      { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "{}" }
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
    const body = (await res.json()) as { mode: string; prod_adapter: string; legacy_token_deprecated: boolean };
    expect(body.mode).toBe("prod");
    expect(body.prod_adapter).toBe("oidc");
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

  it("accepts OIDC id_token login in prod mode", async () => {
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
