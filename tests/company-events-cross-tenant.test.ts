import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCompanyEvent,
  ensureCompanyEventMonth,
  initCompanyEventsFile,
} from "../src/lib/company-events.js";
import { verifyCompanyEventChain } from "../src/lib/company-events-chain.js";
import { refreshOrgOsPaths } from "../src/lib/orgos-paths.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("company-events cross-tenant isolation", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
    delete process.env.ORGOS_WORKSPACE;
    process.env.ORGOS_TENANT = "mal";
    refreshOrgOsPaths();
    setTenantId("mal");
  });

  function setupTenant(workspace: string, tenantId: string): void {
    process.env.ORGOS_WORKSPACE = workspace;
    process.env.ORGOS_TENANT = tenantId;
    refreshOrgOsPaths();
    setTenantId(tenantId);
    initCompanyEventsFile();
    ensureCompanyEventMonth("2099-01");
    createCompanyEvent({
      kind: "misc",
      title: `Event for ${tenantId}`,
      occurredAt: "2099-01-01",
      slug: tenantId,
    });
  }

  it("does not mix chain data between tenants", () => {
    const ws = mkdtempSync(join(tmpdir(), "orgos-xtenant-"));
    dirs.push(ws);

    const tenantA = join(ws, "tenants", "tenant-a");
    const tenantB = join(ws, "tenants", "tenant-b");
    for (const t of [tenantA, tenantB]) {
      mkdirSync(join(t, "data"), { recursive: true });
      writeFileSync(
        join(t, "tenant.yaml"),
        `id: ${t.split("/").pop()}\nname: Test\nlifecycle: test\noperation_mode: development\n`,
        "utf8"
      );
      writeFileSync(
        join(t, "modules.yaml"),
        "modules:\n  - id: rental\n    enabled: false\n    agent: rental\n",
        "utf8"
      );
    }

    setupTenant(ws, "tenant-a");
    const verifyA = verifyCompanyEventChain();
    expect(verifyA.checked).toBe(1);

    setupTenant(ws, "tenant-b");
    const verifyB = verifyCompanyEventChain();
    expect(verifyB.checked).toBe(1);

    process.env.ORGOS_TENANT = "tenant-a";
    refreshOrgOsPaths();
    setTenantId("tenant-a");
    const verifyAgainA = verifyCompanyEventChain();
    expect(verifyAgainA.checked).toBe(1);
  });
});
