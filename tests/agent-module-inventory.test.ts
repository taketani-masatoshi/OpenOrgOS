import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { setTenantId } from "../src/lib/tenant.js";
import { loadModulesFile, modulesFilePath } from "../src/lib/modules.js";
import { modulesFileSchema } from "../schemas/modules.js";
import { writeYamlFile } from "../src/lib/utils.js";
import { importCatalogModule, isModuleInstalled } from "../src/lib/module-import.js";
import { buildAgentModuleInventory } from "../src/lib/steward-chat/agent-module-inventory.js";

function setModuleEnabled(id: string, enabled: boolean): void {
  const file = loadModulesFile();
  const mod = file.modules.find((row) => row.id === id);
  if (!mod) throw new Error(`module ${id} not installed in fixture tenant`);
  mod.enabled = enabled;
  writeYamlFile(modulesFilePath(), modulesFileSchema.parse(file));
}

describe("agent / module inventory", () => {
  let originalModulesYaml = "";

  beforeEach(() => {
    setTenantId("mal");
    originalModulesYaml = readFileSync(modulesFilePath(), "utf-8");
    setModuleEnabled("professional_services", false);
  });

  afterEach(() => {
    if (originalModulesYaml) writeFileSync(modulesFilePath(), originalModulesYaml);
  });

  it("lists roster agents and splits installed modules from the catalog", () => {
    const inventory = buildAgentModuleInventory();
    const steward = inventory.agents.find((row) => row.id === "executive_steward");
    expect(steward).toMatchObject({
      enabled: true,
      required: true,
      owner_desk: true,
      locked: true,
      lock_reason: "owner_desk",
      request_lane: "owner_to_steward",
    });
    expect(inventory.agents.some((row) => row.id === "secretary" && row.owner_desk)).toBe(true);
    const secretary = inventory.agents.find((row) => row.id === "secretary");
    expect(secretary).toMatchObject({
      enabled: true,
      lock_reason: "owner_desk",
      request_lane: "owner_to_secretary",
    });

    const rental = inventory.modules_installed.find((row) => row.id === "rental");
    expect(rental).toMatchObject({ installed: true, enabled: true });
    expect(inventory.modules_catalog.some((row) => row.id === "rental")).toBe(false);

    const professional = inventory.modules_installed.find(
      (row) => row.id === "professional_services"
    );
    expect(professional).toMatchObject({ installed: true, enabled: false });

    expect(inventory.modules_catalog.length).toBeGreaterThan(0);
    expect(inventory.modules_catalog.every((row) => row.installed === false && row.enabled === false)).toBe(
      true
    );
    expect(inventory.agents_available.every((row) => row.enabled === false)).toBe(true);
    expect(inventory.agents_available.some((row) => row.id === "executive_steward")).toBe(false);
    expect(inventory.agents_available.length).toBeGreaterThan(0);
  });

  it("locks a module-bound agent while the module is on", () => {
    const inventory = buildAgentModuleInventory();
    const ir = inventory.agents.find((row) => row.id === "investor_relations");
    expect(ir?.bound_modules).toContain("investor_relations");
    expect(ir).toMatchObject({
      enabled: true,
      locked: true,
      lock_reason: "module_enabled",
    });
  });

  it("imports a catalog module as disabled without activating it", () => {
    const before = buildAgentModuleInventory();
    const sample =
      before.modules_catalog.find((row) => row.id === "language_bridge") ??
      before.modules_catalog[0];
    expect(sample).toBeTruthy();
    const id = sample!.id;
    expect(isModuleInstalled(id)).toBe(false);

    const imported = importCatalogModule(id);
    expect(imported).toMatchObject({ id, enabled: false, agent: id });
    expect(isModuleInstalled(id)).toBe(true);

    const after = buildAgentModuleInventory();
    expect(after.modules_installed.find((row) => row.id === id)).toMatchObject({
      installed: true,
      enabled: false,
    });
    expect(after.modules_catalog.some((row) => row.id === id)).toBe(false);
    expect(after.agents_available).toBeDefined();
    expect(() => importCatalogModule("rental")).toThrow(/already imported/);
  });
});
