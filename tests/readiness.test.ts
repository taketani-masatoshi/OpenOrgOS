import { describe, it, expect } from "vitest";
import { getModuleTier, READINESS_TIERS } from "../src/lib/module-readiness.js";
import { checkModuleCatalogOnly, checkAllModules } from "../src/lib/modules.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("readiness 3 tier", () => {
  it("defines skeleton · activation_ready · production_ready", () => {
    expect(READINESS_TIERS).toEqual(["skeleton", "activation_ready", "production_ready"]);
  });

  it("rental and hospitality are production_ready", () => {
    expect(getModuleTier("rental")).toBe("production_ready");
    expect(getModuleTier("hospitality")).toBe("production_ready");
  });

  it("clinic is production_ready with invoice seeds", () => {
    expect(getModuleTier("clinic")).toBe("production_ready");
    const issues = checkModuleCatalogOnly("clinic", "production_ready");
    expect(issues).toHaveLength(0);
  });

  it("checkAllModules passes for full catalog", () => {
    setTenantId("demo");
    expect(checkAllModules()).toHaveLength(0);
  });
});
