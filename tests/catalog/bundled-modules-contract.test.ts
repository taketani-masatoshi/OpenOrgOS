// @catalog-ids: professional_services, saas_subscription, property_management, software_outsourcing, real_estate_brokerage, membership, staffing, ecommerce, event_operations
// @catalog-coverage: bundled
import { beforeEach, describe, expect, it } from "vitest";
import { setTenantId } from "../../src/lib/tenant.js";
import { getModuleTier } from "../../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  loadModuleManifest,
} from "../../src/lib/modules.js";
import { listModuleCliBundles } from "../../src/lib/module-cli.js";

const BUNDLED_MODULE_IDS = [
  "professional_services",
  "saas_subscription",
  "property_management",
  "software_outsourcing",
  "real_estate_brokerage",
  "membership",
  "staffing",
  "ecommerce",
  "event_operations",
] as const;

describe("bundled catalog modules contract", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("registers all bundled modules on operations CLI", () => {
    const ids = listModuleCliBundles().map((b) => b.moduleId);
    for (const id of BUNDLED_MODULE_IDS) {
      expect(ids).toContain(id);
    }
  });

  for (const catalogId of BUNDLED_MODULE_IDS) {
    describe(catalogId, () => {
      it("has manifest and production_ready tier", () => {
        const manifest = loadModuleManifest(catalogId);
        expect(manifest?.id).toBe(catalogId);
        expect(getModuleTier(catalogId)).toBe("production_ready");
      });

      it("passes catalog-only readiness check", () => {
        const issues = checkModuleCatalogOnly(catalogId, "production_ready");
        expect(issues, JSON.stringify(issues)).toEqual([]);
      });
    });
  }
});
