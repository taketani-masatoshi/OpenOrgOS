import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProdAuthChecks } from "../src/lib/console-auth/prod-checklist.js";
import {
  resetPasskeyBootstrapStoreForTests,
  mintPasskeyBootstrapToken,
} from "../src/lib/wire-console/auth/passkey-bootstrap.js";
import { resetWebAuthnCredentialsForTests } from "../src/lib/wire-console/auth/webauthn-store.js";
import { installFsGuardStoreForTests, type FsGuardStoreFixture } from "./helpers/fs-guard-store-fixture.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { setTenantId } from "../src/lib/tenant.js";
import { clearOperatorsRegistryCacheForTests } from "../src/lib/org/operators.js";

describe("passkey prod readiness (smoke fixture env)", () => {
  const envSnapshot = { ...process.env };
  let guard: FsGuardStoreFixture;
  let workspace = "";

  beforeAll(() => {
    guard = installFsGuardStoreForTests();
  });

  afterAll(() => {
    guard.cleanup();
    if (workspace) rmSync(workspace, { recursive: true, force: true });
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    resetPasskeyBootstrapStoreForTests();
    resetWebAuthnCredentialsForTests();
    clearOperatorsRegistryCacheForTests();
    refreshOrgOsPaths();
  });

  it("runProdAuthChecks passes for wire-console webauthn smoke configuration", () => {
    workspace = mkdtempSync(join(tmpdir(), "passkey-prod-ready-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    const provisioned = provisionLedgerTenant({
      tenantId: "passkey-prod-001",
      companyName: "Passkey Prod KK",
      adminEmail: "ceo@passkey-prod.example",
      plan: "starter",
    });
    process.env.ORGOS_TENANT = "passkey-prod-001";
    setTenantId("passkey-prod-001");
    clearOperatorsRegistryCacheForTests();

    process.env.ORGOS_ENV = "production";
    process.env.WIRE_CONSOLE_AUTH = "prod";
    process.env.WIRE_CONSOLE_PROD_ADAPTER = "webauthn";
    process.env.ORGOS_SESSION_PERSIST = "1";
    process.env.ORGOS_SETTLEMENT_CHALLENGE_SECRET = "prod-readiness-test-secret";
    process.env.WIRE_CONSOLE_WEBAUTHN_RP_ID = "localhost";
    process.env.WIRE_CONSOLE_WEBAUTHN_ORIGIN = "http://localhost:9473";
    delete process.env.WIRE_CONSOLE_WEBAUTHN_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_TEST_SECRET;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_ALLOW_OPEN_BOOTSTRAP;
    delete process.env.WIRE_CONSOLE_WEBAUTHN_CREDENTIALS;
    resetWebAuthnCredentialsForTests();
    mintPasskeyBootstrapToken({ operatorId: provisioned.ceo_operator_id });

    const failed = runProdAuthChecks("wire").filter((c) => !c.ok);
    expect(failed.map((c) => c.id)).toEqual([]);
  });
});
