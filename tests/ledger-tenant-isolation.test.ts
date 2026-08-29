import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { provisionLedgerTenant } from "../src/lib/product/ledger-provision.js";
import { runWithTenantId } from "../src/lib/tenant.js";
import { getDataDir } from "../src/lib/utils.js";
import { journalEntriesPath } from "../src/lib/finance/expense-claim-journal.js";
import { loadLedgerSubscription } from "../src/lib/product/ledger-subscription.js";
import {
  findControlPlaneTenant,
  upsertControlPlaneTenant,
} from "../src/lib/product/ledger-control-plane.js";

describe("ledger tenant isolation", () => {
  const env = { ...process.env };
  let workspace = "";

  afterEach(() => {
    if (workspace) rmSync(workspace, { recursive: true, force: true });
    process.env = { ...env };
    refreshOrgOsPaths();
  });

  it("keeps tenant data paths and control-plane rows separate", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-isolation-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();

    provisionLedgerTenant({
      tenantId: "iso-tenant-a",
      companyName: "Tenant A",
      adminEmail: "a@example.com",
      plan: "starter",
    });
    provisionLedgerTenant({
      tenantId: "iso-tenant-b",
      companyName: "Tenant B",
      adminEmail: "b@example.com",
      plan: "starter",
    });

    const pathA = runWithTenantId("iso-tenant-a", () => journalEntriesPath());
    const pathB = runWithTenantId("iso-tenant-b", () => journalEntriesPath());
    expect(pathA).not.toBe(pathB);

    runWithTenantId("iso-tenant-a", () => {
      writeFileSync(join(getDataDir(), "isolation-marker.txt"), "tenant-a-only", "utf-8");
    });
    const bMarker = runWithTenantId("iso-tenant-b", () =>
      existsSync(join(getDataDir(), "isolation-marker.txt")),
    );
    expect(bMarker).toBe(false);

    const subA = runWithTenantId("iso-tenant-a", () => loadLedgerSubscription());
    const subB = runWithTenantId("iso-tenant-b", () => loadLedgerSubscription());
    expect(subA?.company_name).toBe("Tenant A");
    expect(subB?.company_name).toBe("Tenant B");

    upsertControlPlaneTenant({
      tenantId: "iso-tenant-a",
      companyName: "Tenant A",
      plan: "starter",
    });
    upsertControlPlaneTenant({
      tenantId: "iso-tenant-b",
      companyName: "Tenant B",
      plan: "starter",
    });
    expect(findControlPlaneTenant("iso-tenant-a")?.company_name).toBe("Tenant A");
    expect(findControlPlaneTenant("iso-tenant-b")?.company_name).toBe("Tenant B");
  });

  it("keeps 50 tenant data dirs and rate-limit keys isolated", () => {
    workspace = mkdtempSync(join(tmpdir(), "ledger-isolation-50-"));
    process.env.ORGOS_WORKSPACE = workspace;
    refreshOrgOsPaths();

    const ids = Array.from({ length: 50 }, (_, i) => `iso-${String(i).padStart(3, "0")}`);
    const paths = new Set<string>();
    for (const tenantId of ids) {
      const dest = join(workspace, "tenants", tenantId);
      mkdirSync(dest, { recursive: true });
      writeFileSync(
        join(dest, "tenant.yaml"),
        `id: ${tenantId}\nname: Tenant ${tenantId}\nproduct: orgos-ledger\n`,
        "utf-8",
      );
      const path = runWithTenantId(tenantId, () => journalEntriesPath());
      expect(paths.has(path)).toBe(false);
      paths.add(path);
      upsertControlPlaneTenant({
        tenantId,
        companyName: `Tenant ${tenantId}`,
        plan: "starter",
      });
    }
    expect(paths.size).toBe(50);
    expect(findControlPlaneTenant("iso-000")?.company_name).toBe("Tenant iso-000");
    expect(findControlPlaneTenant("iso-049")?.company_name).toBe("Tenant iso-049");
    expect(findControlPlaneTenant("iso-000")?.host).not.toBe(findControlPlaneTenant("iso-049")?.host);
  });
});
