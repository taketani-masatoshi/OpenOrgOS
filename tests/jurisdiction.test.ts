import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTenantId } from "../src/lib/tenant.js";
import {
  getJurisdictionPack,
  getRegulationsCatalogPath,
  getRegulationsTemplatesDir,
  getResolvedJurisdiction,
  listEntityForms,
  listJurisdictionCodes,
  loadCountriesRegistry,
  resolveCorporateCoreReg,
  resolveEntityForm,
  resolveJurisdictionCode,
} from "../src/lib/jurisdiction.js";
import { loadRegulationsCatalog } from "../src/lib/regulations.js";
import { ROOT_DIR } from "../src/lib/utils.js";

describe("jurisdiction registry", () => {
  it("loads 249 ISO countries plus EU TJS meta entry", () => {
    const reg = loadCountriesRegistry();
    expect(Object.keys(reg.countries).length).toBe(250);
    expect(listJurisdictionCodes()).toContain("JP");
    expect(listJurisdictionCodes()).toContain("FR");
    expect(listJurisdictionCodes()).toContain("EU");
  });

  it("loads all full-tier packs", () => {
    for (const code of [
      "JP",
      "US",
      "SG",
      "EE",
      "HK",
      "AU",
      "TW",
      "MY",
      "CN",
      "AE",
      "RU",
      "EU",
    ] as const) {
      expect(getJurisdictionPack(code).tier).toBe("full");
      const pack = getJurisdictionPack(code);
      expect(pack.tax_profile_schema).toBeDefined();
      expect(pack.regulations_templates_dir).toMatch(
        new RegExp(`^steward/jurisdiction-packs/${code}/regulations/templates$`)
      );
    }
  });

  it("resolves stub country pack", () => {
    const pack = getJurisdictionPack("FR");
    expect(pack.tier).toBe("stub");
    expect(pack.name).toBeTruthy();
  });

  it("lists JP entity forms including gk and civil_law_partnership", () => {
    const ids = listEntityForms("JP").map((f) => f.id);
    expect(ids).toContain("kk");
    expect(ids).toContain("gk");
    expect(ids).toContain("tech_research_combination");
    expect(ids).toContain("civil_law_partnership");
    expect(ids.length).toBeGreaterThanOrEqual(30);
  });

  it("lists JP professional corporations with category and jurisdiction_exclusive", () => {
    const forms = listEntityForms("JP");
    const professionalIds = [
      "attorney_corporation",
      "tax_accountant_corporation",
      "certified_public_accountant_corporation",
      "judicial_scrivener_corporation",
      "administrative_scrivener_corporation",
      "labor_and_social_security_attorney_corporation",
      "patent_attorney_corporation",
    ];
    for (const id of professionalIds) {
      const entry = forms.find((f) => f.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.category).toBe("professional_corporation");
      expect(entry?.jurisdiction_exclusive).toEqual(["JP"]);
      expect(entry?.governing_law_ja).toBeTruthy();
    }
    const usForms = listEntityForms("US");
    expect(usForms.some((f) => f.category === "professional_corporation")).toBe(false);
  });

  it("resolves JP professional corporation entity form", () => {
    const form = resolveEntityForm("JP", "attorney_corporation");
    expect(form.category).toBe("professional_corporation");
    expect(form.jurisdiction_exclusive).toEqual(["JP"]);
    expect(form.governing_law_ja).toBe("弁護士法");
  });

  it("lists Delaware entity forms under US subdivision", () => {
    const ids = listEntityForms("US", "DE").map((f) => f.id);
    expect(ids).toContain("llc");
    expect(ids).toContain("c_corp");
  });

  it("resolves JP tenant from explicit tenant.yaml jurisdiction", () => {
    setTenantId("mal");
    expect(resolveJurisdictionCode("JP")).toBe("JP");
    const resolved = getResolvedJurisdiction();
    expect(resolved.code).toBe("JP");
    expect(resolved.entityForm).toBe("kk");
    expect(resolved.entityFormEntry.name).toContain("株式会社");
    expect(resolved.defaultCurrency).toBe("JPY");
  });

  it("resolves US tenant pack", () => {
    setTenantId("us-demo");
    const resolved = getResolvedJurisdiction();
    expect(resolved.code).toBe("US");
    expect(resolved.entityForm).toBe("c_corp");
    expect(resolved.defaultCurrency).toBe("USD");
    expect(resolveCorporateCoreReg("travel")).toBe("REG-US-008");
  });
});

describe("jurisdiction catalogs", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("loads JP catalog with 29 regulations", () => {
    const catalog = loadRegulationsCatalog();
    expect(catalog.regulations.length).toBe(29);
    expect(existsSync(getRegulationsCatalogPath())).toBe(true);
  });

  it("JP templates dir uses jurisdiction pack path (same layout as other packs)", () => {
    expect(getRegulationsTemplatesDir()).toBe(
      join(ROOT_DIR, "steward", "jurisdiction-packs", "JP", "regulations", "templates")
    );
  });

  it("has templates for each JP catalog entry", () => {
    for (const reg of loadRegulationsCatalog().regulations) {
      expect(existsSync(join(getRegulationsTemplatesDir(), reg.template))).toBe(true);
    }
  });
});

describe("US jurisdiction pack", () => {
  beforeEach(() => {
    setTenantId("us-demo");
  });

  it("loads US catalog with governance regs", () => {
    const catalog = loadRegulationsCatalog();
    expect(catalog.regulations.length).toBe(8);
    expect(catalog.regulations.some((r) => r.id === "REG-US-008")).toBe(true);
  });

  it("has templates for each US catalog entry", () => {
    for (const reg of loadRegulationsCatalog().regulations) {
      expect(existsSync(join(getRegulationsTemplatesDir(), reg.template))).toBe(true);
    }
  });

  it("US pack corporate_core maps travel policy", () => {
    const pack = getJurisdictionPack("US");
    expect(pack.corporate_core.travel).toBe("REG-US-008");
  });
});

describe("us-demo validate", () => {
  it("passes steward validate", () => {
    execFileSync(
      "npm",
      ["run", "orgos", "--", "--tenant", "us-demo", "validate"],
      { cwd: join(import.meta.dirname, ".."), encoding: "utf-8", stdio: "pipe" }
    );
  });
});

describe.each([
  ["sg-demo", "SG", "REG-SG-008"],
  ["ee-demo", "EE", "REG-EE-008"],
  ["hk-demo", "HK", "REG-HK-008"],
  ["au-demo", "AU", "REG-AU-008"],
  ["tw-demo", "TW", "REG-TW-008"],
  ["my-demo", "MY", "REG-MY-008"],
  ["cn-demo", "CN", "REG-CN-008"],
  ["ae-demo", "AE", "REG-AE-008"],
  ["ru-demo", "RU", "REG-RU-008"],
  ["eu-demo", "EU", "REG-EU-008"],
] as const)("jurisdiction pack %s", (tenantId, code, travelRegId) => {
  beforeEach(() => {
    setTenantId(tenantId);
  });

  it("loads catalog with 8 governance regs", () => {
    expect(loadRegulationsCatalog().regulations.length).toBe(8);
    expect(resolveCorporateCoreReg("travel")).toBe(travelRegId);
  });

  it("has templates for each catalog entry", () => {
    for (const reg of loadRegulationsCatalog().regulations) {
      expect(existsSync(join(getRegulationsTemplatesDir(), reg.template))).toBe(true);
    }
  });

  it("passes steward validate", () => {
    execFileSync(
      "npm",
      ["run", "orgos", "--", "--tenant", tenantId, "validate"],
      { cwd: join(import.meta.dirname, ".."), encoding: "utf-8", stdio: "pipe" }
    );
  });
});
