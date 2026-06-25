import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getModuleSeedDir,
  listCatalogModuleIds,
  listModuleSeedFiles,
  loadModuleManifest,
  loadModulesFile,
  resolveModuleLocation,
  validateModules,
} from "../src/lib/modules.js";

const REPO_ROOT = join(import.meta.dirname, "..");

describe("modules.yaml", () => {
  it("loads mal tenant modules", () => {
    const file = loadModulesFile();
    expect(file.modules.length).toBeGreaterThanOrEqual(2);
    const rental = file.modules.find((m) => m.id === "rental");
    expect(rental?.enabled).toBe(true);
    expect(rental?.property_ids).toContain("PROP-001");
  });

  it("validates mal modules without errors", () => {
    const issues = validateModules();
    expect(issues).toEqual([]);
  });

  it("lists catalog modules", () => {
    const ids = listCatalogModuleIds();
    expect(ids).toEqual([
      "clinic",
      "construction",
      "ecommerce",
      "education",
      "event_operations",
      "event_space",
      "hospitality",
      "jp_carbon_neutral_2050",
      "jp_privacy_policy",
      "jp_subsidy_application",
      "jp_women_empowerment",
      "language_bridge",
      "logistics",
      "membership",
      "professional_services",
      "property_management",
      "real_estate_brokerage",
      "rental",
      "restaurant",
      "retail_store",
      "saas_subscription",
      "software_outsourcing",
      "staffing",
      "travel_booking",
      "venture_capital",
    ]);
  });

  it("has seed data for catalog modules", () => {
    for (const id of listCatalogModuleIds()) {
      const seedDir = getModuleSeedDir(id);
      expect(existsSync(seedDir)).toBe(true);
      expect(listModuleSeedFiles(id).length).toBeGreaterThan(0);
    }
  });

  it("every catalog module satisfies the module contract", () => {
    expect(existsSync(join(REPO_ROOT, "steward/modules/module_contract.md"))).toBe(true);
    for (const id of listCatalogModuleIds()) {
      const loc = resolveModuleLocation(id);
      expect(loc, `${id} location`).not.toBeNull();
      expect(existsSync(join(loc!.rootDir, "agent.md")), `${id}/agent.md`).toBe(true);
      const manifest = loadModuleManifest(id);
      expect(manifest, `${id} manifest`).not.toBeNull();
      expect(manifest?.id, `${id} manifest.id matches dir`).toBe(id);
    }
  });
});
