import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { matchSessionTenant } from "../src/lib/console-auth/session-tenant.js";
import {
  createDevSession,
  getSessionUser,
  registerSession,
  resetSessionsForTests,
  type WireConsoleUser,
} from "../src/lib/wire-console/auth/session.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { runWithTenantId, setTenantId } from "../src/lib/tenant.js";
import { startOperatorConsoleServer } from "../src/lib/operator-console/combined-server.js";

describe("session tenant binding", () => {
  const env = { ...process.env };
  let workspace = "";

  beforeEach(() => {
    resetSessionsForTests();
    process.env.ORGOS_SESSION_PERSIST = "0";
    process.env.WIRE_CONSOLE_DEV_PASSKEY = "test-pass";
    process.env.WIRE_CONSOLE_AUTH = "dev";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.ORGOS_CSRF = "0";
    process.env.ORGOS_RATE_LIMIT = "0";
    process.env.ORGOS_ENV = "development";
    delete process.env.ORGOS_REQUIRE_REQUEST_TENANT;
  });

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    workspace = "";
    process.env = { ...env };
    resetSessionsForTests();
    refreshOrgOsPaths();
  });

  function seedTenant(id: string): void {
    const root = join(workspace, "tenants", id);
    mkdirSync(join(root, "data", "org"), { recursive: true });
    writeFileSync(
      join(root, "tenant.yaml"),
      `id: ${id}\nname: ${id}\njurisdiction: JP\nentity_form: kk\n`,
      "utf-8",
    );
    writeFileSync(
      join(root, "data/org/operators.yaml"),
      `version: "1"\noperators:\n  - operator_id: OP-001\n    display_name: CEO\n    role: ceo\n    status: active\n    email: ceo@${id}.example\n`,
      "utf-8",
    );
  }

  it("stores tenant_id from ALS on registerSession", () => {
    workspace = mkdtempSync(join(tmpdir(), "session-tenant-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    seedTenant("acme");
    const { user } = runWithTenantId("acme", () =>
      registerSession({
        operator_id: "OP-001",
        approver_id: "OP-001",
        mode: "dev",
      }),
    );
    expect(user.tenant_id).toBe("acme");
  });

  it("matchSessionTenant rejects cross-tenant header", () => {
    const user: WireConsoleUser = {
      operator_id: "OP-001",
      approver_id: "OP-001",
      mode: "dev",
      tenant_id: "tenant-a",
    };
    const mismatch = matchSessionTenant(user, "tenant-b");
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.status).toBe(403);
      expect(mismatch.error).toMatch(/mismatch/);
    }
    const ok = matchSessionTenant(user, "tenant-a");
    expect(ok).toEqual({ ok: true, tenantId: "tenant-a" });
  });

  it("HTTP: session from tenant A cannot switch to tenant B via header", async () => {
    workspace = mkdtempSync(join(tmpdir(), "session-tenant-http-"));
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_REQUIRE_REQUEST_TENANT = "1";
    process.env.ORGOS_LEDGER_HOST_SUFFIX = ".ledger.localhost";
    refreshOrgOsPaths();
    seedTenant("tenant-a");
    seedTenant("tenant-b");
    mkdirSync(join(workspace, "product-fleet"), { recursive: true });
    writeFileSync(
      join(workspace, "product-fleet/control-plane.yaml"),
      `version: 1\ntenants:\n  - tenant_id: tenant-a\n    company_name: A\n    host_slug: tenant-a\n    host: tenant-a.ledger.localhost\n    status: active\n    updated_at: "2026-01-01T00:00:00.000Z"\n  - tenant_id: tenant-b\n    company_name: B\n    host_slug: tenant-b\n    host: tenant-b.ledger.localhost\n    status: active\n    updated_at: "2026-01-01T00:00:00.000Z"\n`,
      "utf-8",
    );
    writeFileSync(join(workspace, "orgos.yaml"), "version: 1\n", "utf-8");

    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    try {
      const login = await fetch(`${handle.url}/chat/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OrgOS-Tenant": "tenant-a",
        },
        body: JSON.stringify({
          passkey: "test-pass",
          operator_id: "OP-001",
          approver_id: "OP-001",
        }),
      });
      expect(login.status, await login.clone().text()).toBe(200);
      const cookie = login.headers.get("set-cookie") ?? "";
      const body = (await login.json()) as { user?: { tenant_id?: string } };
      expect(body.user?.tenant_id).toBe("tenant-a");

      const crossed = await fetch(`${handle.url}/chat/v1/auth/me`, {
        headers: {
          Cookie: cookie,
          "X-OrgOS-Tenant": "tenant-b",
        },
      });
      // /auth/me is public auth path — mismatch is enforced on authenticated APIs.
      // Use today which requires auth + tenant match.
      const today = await fetch(`${handle.url}/chat/v1/today`, {
        headers: {
          Cookie: cookie,
          "X-OrgOS-Tenant": "tenant-b",
        },
      });
      expect(today.status).toBe(403);
      const err = (await today.json()) as { error?: string };
      expect(err.error).toMatch(/mismatch/);
    } finally {
      await new Promise<void>((resolve) => handle.close(() => resolve()));
    }
  });

  it("createDevSession binds current tenant", () => {
    workspace = mkdtempSync(join(tmpdir(), "session-dev-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    seedTenant("solo");
    setTenantId("solo");
    const result = createDevSession({
      passkey: "test-pass",
      operator_id: "OP-001",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.user.tenant_id).toBe("solo");
    expect(getSessionUser(result.token)?.tenant_id).toBe("solo");
  });
});
