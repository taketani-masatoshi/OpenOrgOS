import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { controlMapFileSchema } from "../schemas/control-framework.js";
import { planIsoScaffold, patchCatalogEntry } from "../src/commands/iso-scaffold.js";
import {
  findIsoCatalogEntry,
  listComingSoonIsoEntries,
  verifyIsoMaps,
} from "../src/lib/iso-catalog.js";
import { getIsoStandardDir } from "../src/lib/standards.js";
import { proposeTenantConfigChange } from "../src/lib/org/tenant-config-change.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("ISO coming soon", () => {
  const soon = listComingSoonIsoEntries();

  it("roadmap entries exist and have no pack folder", () => {
    expect(soon.length).toBeGreaterThan(0);
    for (const e of soon) {
      expect(existsSync(getIsoStandardDir(e.id)), `${e.id} should not have a pack yet`).toBe(false);
      expect(e.encoding).toBe("none");
    }
  });

  it("verifyIsoMaps stays ok despite missing folders", () => {
    expect(verifyIsoMaps().ok).toBe(true);
  });

  it("tier filter narrows the roadmap", () => {
    const tier1 = listComingSoonIsoEntries("1");
    expect(tier1.length).toBeGreaterThan(0);
    expect(tier1.every((e) => e.tier === "1")).toBe(true);
    expect(tier1.map((e) => e.id)).toContain("ISO-42001");
  });

  it("a coming_soon standard cannot be enabled by a tenant", () => {
    setTenantId("mal");
    expect(() =>
      proposeTenantConfigChange({
        target: "standards",
        targetId: "ISO-42001",
        enabled: true,
        requestedBy: "OP-TEST",
        reason: "test",
      })
    ).toThrow(/coming_soon|未提供/);
  });

  it("scaffold plans a pack shell from the declared core profile", () => {
    const plan = planIsoScaffold("ISO-42001");
    const map = plan.files.find((f) => f.path.endsWith("control-map.yaml"));
    expect(map?.content).toContain("standard: ISO-42001");
    expect(map?.content).toContain("core_bindings:");
    expect(map?.content).toContain("work: internal_audit");
    expect(plan.files.some((f) => f.path.endsWith(".md"))).toBe(true);
  });

  it("a freshly scaffolded pack parses before any domain control is written", () => {
    const plan = planIsoScaffold("ISO-42001");
    const map = plan.files.find((f) => f.path.endsWith("control-map.yaml"));
    const parsed = controlMapFileSchema.safeParse(parseYaml(map?.content ?? ""));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.success && parsed.data.controls).toEqual([]);
    expect(parsed.success && parsed.data.core_bindings.length).toBeGreaterThan(0);
  });

  it("scaffold refuses guidance and control-set entries", () => {
    expect(() => planIsoScaffold("ISO-31000")).toThrow(/guidance/);
    expect(() => planIsoScaffold("ISO-27002")).toThrow(/control_set/);
  });

  it("scaffold refuses a standard that is already available", () => {
    expect(() => planIsoScaffold("ISO-9001")).toThrow(/available/);
  });

  it("catalog patch flips only the target entry", () => {
    const source = [
      "standards:",
      "  - id: ISO-42001",
      "    status: coming_soon",
      "    encoding: none",
      "  - id: ISO-37301",
      "    status: coming_soon",
      "    encoding: none",
    ].join("\n");
    const patched = patchCatalogEntry(source, "ISO-42001");
    expect(patched).toContain("  - id: ISO-42001\n    status: available\n    encoding: control_map");
    expect(patched).toContain("  - id: ISO-37301\n    status: coming_soon\n    encoding: none");
  });

  it("guidance roadmap entries back the core guidance_refs", () => {
    expect(findIsoCatalogEntry("ISO-31000")?.kind).toBe("guidance");
    expect(findIsoCatalogEntry("ISO-19011")?.kind).toBe("guidance");
  });
});
