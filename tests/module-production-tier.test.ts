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
] as const;

describe("module production_ready tier (Direction C)", () => {
  it("lists seven production_ready modules", () => {
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
    const invoiceModules = [
      "rental",
      "restaurant",
      "professional_services",
      "saas_subscription",
      "ecommerce",
      "membership",
    ];
    for (const id of invoiceModules) {
      const manifest = loadModuleManifest(id);
      expect(manifest?.required_seeds?.length, id).toBeGreaterThan(0);
      const seedDir = getModuleSeedDir(id);
      for (const file of manifest!.required_seeds!) {
        expect(existsSync(join(seedDir, file)), `${id}/${file}`).toBe(true);
      }
    }
  });

  it("ecommerce manifest declares invoice templates", () => {
    const manifest = loadModuleManifest("ecommerce");
    expect(manifest?.required_seeds).toContain("invoice-ecommerce-monthly.yaml");
    expect(manifest?.required_seeds).toContain("invoice-ecommerce-monthly-body.txt");
  });

  it("membership manifest declares invoice templates", () => {
    const manifest = loadModuleManifest("membership");
    expect(manifest?.required_seeds).toContain("invoice-membership-monthly.yaml");
    expect(manifest?.required_seeds).toContain("invoice-membership-monthly-body.txt");
  });

  it("loads ecommerce invoice template from module seed", () => {
    const template = loadInvoiceTemplate("ecommerce", "ecommerce-monthly");
    expect(template.id).toBe("ecommerce-monthly");
    expect(template.module).toBe("ecommerce");
  });
});
