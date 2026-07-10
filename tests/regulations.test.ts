import { describe, it, expect, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import {
  listEffectiveRegulations,
  loadEnabledRegulationIds,
  loadRegulationsCatalog,
  validateRegulations,
} from "../src/lib/regulations.js";
import { buildActiveContextMarkdown } from "../src/lib/context-manifest.js";
import { getRegulationsTemplatesDir } from "../src/lib/jurisdiction.js";

describe("regulations", () => {
  beforeEach(() => {
    setTenantId("mal");
  });
  it("loads catalog with 29 regulations", () => {
    const catalog = loadRegulationsCatalog();
    expect(catalog.regulations.length).toBe(29);
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
  }, 15_000);

  it("lists block reason when tenant enabled but bind inactive", () => {
    const reg13 = listEffectiveRegulations().find((r) => r.id === "REG-013");
    expect(reg13?.tenantEnabled).toBe(false);
    expect(reg13?.effective).toBe(false);
  });

  it("active context includes legal jurisdiction and display language", () => {
    const md = buildActiveContextMarkdown();
    expect(md).toContain("**法域（legal）:**");
    expect(md).toContain("**表示言語（display）:**");
    expect(md).toContain("`JP`");
    expect(md).toContain("## 有効社内規程");
    expect(md).toContain("REG-012");
  });
});

describe("regulation templates", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("has template for each catalog entry", () => {
    for (const reg of loadRegulationsCatalog().regulations) {
      expect(existsSync(join(getRegulationsTemplatesDir(), reg.template))).toBe(true);
    }
  });
});
