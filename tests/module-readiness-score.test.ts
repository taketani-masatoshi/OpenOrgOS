import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  computeModuleReadiness,
  computeModuleReadinessForTenant,
} from "../src/lib/module-readiness-score.js";

describe("module readiness score", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("scores rental with CLI bundle registered", () => {
    const r = computeModuleReadiness("rental", { tenantId: "mal" });
    expect(r.axes.find((a) => a.id === "cli")?.score).toBeGreaterThanOrEqual(16);
  });

  it("mal core 8 modules reach 100 readiness", () => {
    const malCore8 = [
      "jp_medical_device",
      "investor_relations",
      "hospitality",
      "jp_bank_corporate",
      "jp_corporate_registration",
      "customer_success",
      "travel_booking",
      "rental",
    ] as const;
    for (const moduleId of malCore8) {
      const r = computeModuleReadiness(moduleId, { tenantId: "mal" });
      expect(r.pct, `${moduleId} readiness`).toBeGreaterThanOrEqual(100);
    }
  });
});
