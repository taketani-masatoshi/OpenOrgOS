import { describe, expect, it, beforeAll, afterEach, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startOperatorConsoleServer } from "../src/lib/operator-console/combined-server.js";
import { installSpaDistStub, type SpaDistStub } from "./helpers/spa-dist-stub.js";
import { assertProdAuthReady } from "../src/lib/console-auth/prod-checklist.js";
import { installFsGuardStoreForTests, type FsGuardStoreFixture } from "./helpers/fs-guard-store-fixture.js";
import { mintPasskeyBootstrapToken } from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { setTenantId } from "../src/lib/tenant.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";

describe("prod startup", () => {
  const env = { ...process.env };
  let guard: FsGuardStoreFixture;
  let spaStub: SpaDistStub;
  let workspace = "";

  beforeAll(() => {
    spaStub = installSpaDistStub();
    guard = installFsGuardStoreForTests();
  });

  afterAll(() => {
    guard.cleanup();
    spaStub.restore();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  afterEach(() => {
    process.env = { ...env };
    clearOperatorsRegistryCacheForTests();
    refreshOrgOsPaths();
  });

  function setProdEnv(): void {
    workspace = mkdtempSync(join(tmpdir(), "prod-startup-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const provisioned = provisionLedgerTenant({
      tenantId: "prod-startup-001",
      companyName: "Prod Startup KK",
      adminEmail: "ceo@prod-startup.example",
      plan: "starter",
    });
    process.env.ORGOS_TENANT = "prod-startup-001";
    setTenantId("prod-startup-001");
    clearOperatorsRegistryCacheForTests();

    process.env.ORGOS_ENV = "production";
    process.env.STEWARD_CHAT_AUTH = "1";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9470";
    process.env.ORGOS_MCP_TOKEN = "test-mcp-token-for-prod-startup";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "prod-startup-test-settlement-secret";
    mintPasskeyBootstrapToken({ operatorId: provisioned.ceo_operator_id });
    delete process.env.WIRE_CONSOLE_DEV_PASSKEY;
    delete process.env.ORGOS_SESSION_PERSIST;
    delete process.env.ORGOS_LLM_MOCK;
    delete process.env.ORGOS_CSRF;
    delete process.env.ORGOS_RATE_LIMIT;
    delete process.env.ORGOS_CHAT_AUDIT;
    delete process.env.ORGOS_MCP_AUTH;
    delete process.env.STEWARD_CHAT_HOST;
    delete process.env.OPERATOR_CONSOLE_HOST;
    delete process.env.ORGOS_SETTLEMENT_RP_ID;
    delete process.env.ORGOS_SETTLEMENT_STEPUP;
  }

  it("passes prod auth checklist with required env", () => {
    setProdEnv();
    expect(() => assertProdAuthReady("all")).not.toThrow();
  });

  it("starts operator console server in production mode", async () => {
    setProdEnv();
    const handle = await startOperatorConsoleServer({ host: "127.0.0.1", port: 0 });
    expect(handle.url).toMatch(/^http:\/\//);
    await new Promise<void>((resolve) => handle.close(resolve));
  });

  it("rejects startup when CSRF disabled in production", () => {
    setProdEnv();
    process.env.ORGOS_CSRF = "0";
    expect(() => assertProdAuthReady("all")).toThrow(/ORGOS_CSRF=0/);
  });
});
