import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { upsertControlPlaneTenant } from "../src/lib/product/ledger-control-plane.js";
import {
  offboardLedgerTenant,
  purgeDueLedgerTenants,
} from "../src/lib/product/ledger-tenant-offboard.js";
import { getTenantsDir } from "../src/lib/orgos-paths.js";

describe("ledger tenant offboard", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("schedules purge after grace and purges when due", () => {
    workspace = mkdtempSync(join(tmpdir(), "offboard-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "offboard-001",
      companyName: "Offboard KK",
      adminEmail: "ceo@offboard.example",
      plan: "starter",
    });
    upsertControlPlaneTenant({
      tenantId: "offboard-001",
      companyName: "Offboard KK",
    });
    setTenantId("offboard-001");

    const scheduled = offboardLedgerTenant({
      tenantId: "offboard-001",
      exportFirst: false,
      purge: true,
      graceDays: 1,
    });
    expect(scheduled.status).toBe("purge_scheduled");
    expect(scheduled.purge_after).toBeTruthy();
    expect(existsSync(join(getTenantsDir(), "offboard-001"))).toBe(true);

    const purged = purgeDueLedgerTenants(Date.now() + 2 * 24 * 60 * 60 * 1000);
    expect(purged).toContain("offboard-001");
    expect(existsSync(join(getTenantsDir(), "offboard-001"))).toBe(false);
  });

  it("purges immediately with purgeNow", () => {
    workspace = mkdtempSync(join(tmpdir(), "offboard-now-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();
    provisionLedgerTenant({
      tenantId: "offboard-now",
      companyName: "Now KK",
      adminEmail: "ceo@now.example",
      plan: "starter",
    });
    upsertControlPlaneTenant({
      tenantId: "offboard-now",
      companyName: "Now KK",
    });

    const result = offboardLedgerTenant({
      tenantId: "offboard-now",
      exportFirst: false,
      purge: true,
      purgeNow: true,
    });
    expect(result.status).toBe("purged");
    expect(existsSync(join(getTenantsDir(), "offboard-now"))).toBe(false);
  });
});
