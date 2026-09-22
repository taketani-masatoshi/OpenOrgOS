import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getTenantsDir, setTenantId } from "../src/lib/tenant.js";

describe("project-codes property map", () => {
  it("resolves PROP-001 and PROP-002 from tenant registry", async () => {
    const tenant = `prj-codes-${process.pid}`;
    const tenantDir = join(getTenantsDir(), tenant);
    mkdirSync(join(tenantDir, "data", "finance"), { recursive: true });
    writeFileSync(
      join(tenantDir, "tenant.yaml"),
      `id: ${tenant}\nname: project codes fixture\nlifecycle: test\noperation_mode: development\njurisdiction: JP\n`,
      "utf-8",
    );
    writeFileSync(
      join(tenantDir, "data", "finance", "project-codes.yaml"),
      [
        "version: 1",
        "projects:",
        "  - code: PRJ-BANCHO",
        "    name: 二番町",
        "    property_id: PROP-001",
        "  - code: PRJ-KAMEZAWA",
        "    name: 亀沢",
        "    property_id: PROP-002",
        "",
      ].join("\n"),
      "utf-8",
    );
    const prev = process.env.ORGOS_TENANT;
    try {
      process.env.ORGOS_TENANT = tenant;
      setTenantId(tenant);
      const { resolveProjectCodeForProperty } = await import("../src/lib/finance/project-codes.js");
      expect(resolveProjectCodeForProperty("PROP-001")).toBe("PRJ-BANCHO");
      expect(resolveProjectCodeForProperty("PROP-002")).toBe("PRJ-KAMEZAWA");
      expect(resolveProjectCodeForProperty("PROP-999")).toBeUndefined();
    } finally {
      process.env.ORGOS_TENANT = prev;
      setTenantId(prev?.trim() || "mal");
      rmSync(tenantDir, { recursive: true, force: true });
    }
  });
});
