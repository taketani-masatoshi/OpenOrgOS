import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { getModuleTier } from "../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
} from "../src/lib/modules.js";

describe("restaurant module", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has manifest matching catalog id", () => {
    const manifest = loadModuleManifest("restaurant");
    expect(manifest?.id).toBe("restaurant");
    expect(getModuleTier("restaurant")).toBe("production_ready");
  });

  it("passes catalog-only readiness check", () => {
    const issues = checkModuleCatalogOnly("restaurant", "production_ready");
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});
