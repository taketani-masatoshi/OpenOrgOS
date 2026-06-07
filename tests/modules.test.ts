import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getModuleSeedDir,
  listCatalogModuleIds,
  listModuleSeedFiles,
  loadModulesFile,
  validateModules,
} from "../src/lib/modules.js";

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
      "event_space",
      "hospitality",
      "logistics",
      "membership",
      "professional_services",
      "rental",
      "restaurant",
      "retail_store",
      "saas_subscription",
      "staffing",
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
});
