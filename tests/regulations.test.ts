import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  listEffectiveRegulations,
  loadEnabledRegulationIds,
  loadRegulationsCatalog,
  STEWARD_REGULATIONS_DIR,
  validateRegulations,
} from "../src/lib/regulations.js";
import { join } from "node:path";
import { buildActiveContextMarkdown } from "../src/lib/context-manifest.js";

describe("regulations", () => {
  it("loads catalog with 24 regulations", () => {
    const catalog = loadRegulationsCatalog();
    expect(catalog.regulations.length).toBe(24);
  });

  it("mal effective regulations exclude disabled ISO/module binds", () => {
    const ids = loadEnabledRegulationIds();
    expect(ids).toContain("REG-012");
    expect(ids).toContain("REG-014");
    expect(ids).not.toContain("REG-013");
    expect(ids).not.toContain("REG-015");
    expect(ids).not.toContain("REG-017");
  });

  it("validates mal regulations without errors", () => {
    expect(validateRegulations()).toEqual([]);
  });

  it("lists block reason when tenant enabled but bind inactive", () => {
    const reg13 = listEffectiveRegulations().find((r) => r.id === "REG-013");
    expect(reg13?.tenantEnabled).toBe(false);
    expect(reg13?.effective).toBe(false);
  });

  it("active context includes regulations section", () => {
    const md = buildActiveContextMarkdown();
    expect(md).toContain("## 有効社内規程");
    expect(md).toContain("REG-012");
    expect(md).toContain("## 無効社内規程（読取禁止）");
    expect(md).toContain("REG-013");
  });
});

describe("regulation templates", () => {
  it("has template for each catalog entry", () => {
    for (const reg of loadRegulationsCatalog().regulations) {
      expect(existsSync(join(STEWARD_REGULATIONS_DIR, reg.template))).toBe(true);
    }
  });
});
