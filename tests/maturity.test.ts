import { beforeEach, describe, expect, it } from "vitest";
import { computeMaturityReport } from "../src/lib/maturity.js";
import { listP0Items } from "../src/lib/p0-status.js";
import { getModuleTier } from "../src/lib/module-readiness.js";
import { setTenantId } from "../src/lib/tenant.js";

beforeEach(() => {
  setTenantId("mal");
});

describe("maturity", () => {
  it("computes three dimensions", () => {
    const r = computeMaturityReport();
    expect(r.preparedness.pct).toBeGreaterThan(0);
    expect(r.operational.label).toBe("運用度");
    expect(r.automation.label).toBe("自動化度");
    expect(r.overall).toBeGreaterThan(0);
  }, 15_000);

  it("lists P0 items including audit", () => {
    const items = listP0Items();
    expect(items.find((i) => i.id === "audit-01")?.status).toBe("done");
    expect(items.find((i) => i.id === "CTR-013")?.status).toBe("open");
  });
});

describe("module readiness", () => {
  it("uses 3-tier readiness", () => {
    expect(getModuleTier("rental")).toBe("production_ready");
    expect(getModuleTier("hospitality")).toBe("production_ready");
    expect(getModuleTier("restaurant")).toBe("production_ready");
    expect(getModuleTier("clinic")).toBe("production_ready");
  });
});
