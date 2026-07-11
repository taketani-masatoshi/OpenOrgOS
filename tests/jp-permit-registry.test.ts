// @catalog-coverage: full
import { describe, expect, it, vi } from "vitest";
import { loadModuleManifest } from "../src/lib/modules.js";
import { listModuleCliBundles } from "../src/lib/module-cli.js";
import {
  runJpPermitRegistryGap,
  runJpPermitRegistryObligations,
  runJpPermitRegistryShow,
  runJpPermitRegistryTypes,
  runJpPermitRegistryValidate,
} from "../steward/jurisdiction-packs/JP/modules/jp_permit_registry/cli/lib.js";
import { permitTypesCatalogFileSchema } from "../schemas/jp-permit-registry.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

describe("jp_permit_registry module", () => {
  it("has skeleton manifest and CLI bundle", () => {
    const manifest = loadModuleManifest("jp_permit_registry");
    expect(manifest?.id).toBe("jp_permit_registry");
    expect(listModuleCliBundles().map((b) => b.moduleId)).toContain("jp_permit_registry");
  });

  it("JP catalog has 60+ permit types across sectors", () => {
    const path = join(
      process.cwd(),
      "steward/jurisdiction-packs/JP/modules/jp_permit_registry/seed/permit-types-catalog.yaml.example"
    );
    const data = permitTypesCatalogFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
    expect(data.permit_types.length).toBeGreaterThanOrEqual(60);
    expect(data.sectors.length).toBeGreaterThanOrEqual(15);
    const categories = new Set(data.permit_types.map((t) => t.category));
    expect(categories.has("accommodation")).toBe(true);
    expect(categories.has("medical_health")).toBe(true);
  });

  it("validates catalog cross-references", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = process.env.STEWARD_TENANT;
    process.env.STEWARD_TENANT = "demo";
    runJpPermitRegistryValidate();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("jp_permit_registry"));
    spy.mockRestore();
    process.env.STEWARD_TENANT = prev;
  });

  it("lists ryokan obligations from catalog", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpPermitRegistryObligations({ type: "pt-ryokan-hotel" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("OBL-RYOKAN"))).toBe(true);
    spy.mockRestore();
  });

  it("shows catalog summary", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpPermitRegistryShow({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("jp_permit_registry"))).toBe(true);
    spy.mockRestore();
  });

  it("lists permit types by category", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    runJpPermitRegistryTypes({ category: "accommodation" });
    expect(spy.mock.calls.some((c) => String(c[0]).includes("pt-ryokan"))).toBe(true);
    spy.mockRestore();
  });

  it("runs gap analysis without error on empty tenant registry", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const prev = process.env.STEWARD_TENANT;
    process.env.STEWARD_TENANT = "demo";
    runJpPermitRegistryGap({});
    expect(spy.mock.calls.some((c) => String(c[0]).includes("gap"))).toBe(true);
    spy.mockRestore();
    process.env.STEWARD_TENANT = prev;
  });
});
