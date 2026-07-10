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

function listProductionReadyCatalogIds(): string[] {
  return listCatalogModuleIds().filter((id) => getModuleTier(id) === "production_ready");
}

describe("module production_ready tier (Direction C)", () => {
  it("lists production_ready modules including jp_corporate_registration", () => {
    const production = listProductionReadyCatalogIds();
    expect(production).toContain("jp_corporate_registration");
    expect(production).toContain("jp_carbon_neutral_2050");
    expect(production).toContain("jp_women_empowerment");
    expect(production).toContain("jp_privacy_policy");
    expect(production.length).toBe(28);
  });

  it("each production_ready module passes catalog check", () => {
    for (const id of listProductionReadyCatalogIds()) {
      const issues = checkModuleCatalogOnly(id, "production_ready");
      expect(issues, id).toEqual([]);
    }
  });

  it("invoice seeds exist for billable production modules", () => {
    for (const id of listProductionReadyCatalogIds()) {
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
