import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { getModuleTier } from "../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
  loadModulesFile,
} from "../src/lib/modules.js";

describe("rental module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest and is enabled on mal tenant", () => {
    const manifest = loadModuleManifest("rental");
    expect(manifest?.id).toBe("rental");
    expect(getModuleTier("rental")).toBe("production_ready");
    const mod = loadModulesFile().modules.find((m) => m.id === "rental");
    expect(mod?.enabled).toBe(true);
    expect(mod?.property_ids).toContain("PROP-001");
  });

  it("passes catalog-only readiness check", () => {
    const issues = checkModuleCatalogOnly("rental", "production_ready");
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});
