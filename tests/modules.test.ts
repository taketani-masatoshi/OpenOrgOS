import { describe, expect, it } from "vitest";
import { loadModulesFile, validateModules } from "../src/lib/modules.js";

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

  it("lists catalog modules", async () => {
    const { listCatalogModuleIds } = await import("../src/lib/modules.js");
    expect(listCatalogModuleIds()).toEqual([
      "hospitality",
      "professional_services",
      "rental",
    ]);
  });
});
