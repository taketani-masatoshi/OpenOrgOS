import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getModuleTier } from "../src/lib/module-readiness.js";
import {
  checkModuleCatalogOnly,
  getModuleSeedDir,
  listCatalogModuleIds,
  loadModuleManifest,
} from "../src/lib/modules.js";
import { loadInvoiceTemplate } from "../src/lib/invoice-config.js";

const PRODUCTION_READY_IDS = [
  "rental",
  "hospitality",
  "restaurant",
  "professional_services",
  "saas_subscription",
  "ecommerce",
  "membership",
  "staffing",
  "event_space",
  "retail_store",
  "logistics",
  "clinic",
  "construction",
  "education",
  "venture_capital",
  "software_outsourcing",
  "event_operations",
  "real_estate_brokerage",
  "property_management",
  "travel_booking",
  "language_bridge",
  "jp_subsidy_application",
  "jp_trademark_application",
  "jp_corporate_registration",
] as const;

describe("module production_ready tier (Direction C)", () => {
  it("lists production_ready modules including jp_corporate_registration", () => {
    const production = listCatalogModuleIds().filter((id) => getModuleTier(id) === "production_ready");
    for (const id of PRODUCTION_READY_IDS) {
      expect(production).toContain(id);
    }
    expect(production.length).toBeGreaterThanOrEqual(PRODUCTION_READY_IDS.length);
  });

  it("each production_ready module passes catalog check", () => {
    for (const id of PRODUCTION_READY_IDS) {
      const issues = checkModuleCatalogOnly(id, "production_ready");
      expect(issues, id).toEqual([]);
    }
  });

  it("invoice seeds exist for billable production modules", () => {
    for (const id of PRODUCTION_READY_IDS) {
      const manifest = loadModuleManifest(id);
      const invoiceSeeds = manifest?.required_seeds?.filter((s) => s.startsWith("invoice-")) ?? [];
      if (invoiceSeeds.length === 0) continue;
      const seedDir = getModuleSeedDir(id);
      for (const file of invoiceSeeds) {
        expect(existsSync(join(seedDir, file)), `${id}/${file}`).toBe(true);
      }
    }
  });

  it("staffing manifest declares invoice templates", () => {
    const manifest = loadModuleManifest("staffing");
    expect(manifest?.required_seeds).toContain("invoice-staffing-monthly.yaml");
  });

  it("loads staffing invoice template from module seed", () => {
    const template = loadInvoiceTemplate("staffing", "staffing-monthly");
    expect(template.module).toBe("staffing");
  });
});
