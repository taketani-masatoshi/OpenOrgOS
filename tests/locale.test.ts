import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  getResolvedDisplayLocale,
  listDisplayLanguageCodes,
  loadDisplayLanguageRegistry,
  resolveDisplayLanguageCode,
} from "../src/lib/locale.js";
import { getResolvedJurisdiction } from "../src/lib/jurisdiction.js";

describe("display language registry", () => {
  it("loads ja en zh et ar ru de languages", () => {
    const registry = loadDisplayLanguageRegistry();
    expect(listDisplayLanguageCodes()).toContain("ja");
    expect(listDisplayLanguageCodes()).toContain("en");
    expect(listDisplayLanguageCodes()).toContain("ar");
    expect(listDisplayLanguageCodes()).toContain("ru");
    expect(listDisplayLanguageCodes()).toContain("de");
    expect(registry.languages.ja.bcp47).toBe("ja-JP");
  });

  it("resolves display language codes", () => {
    expect(resolveDisplayLanguageCode("ja")).toBe("ja");
    expect(resolveDisplayLanguageCode("en")).toBe("en");
  });
});

describe("display vs jurisdiction independence", () => {
  const prevEnv = process.env.STEWARD_DISPLAY_LANGUAGE;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.STEWARD_DISPLAY_LANGUAGE;
    else process.env.STEWARD_DISPLAY_LANGUAGE = prevEnv;
  });

  it("JP tenant uses ja display and JP law", () => {
    setTenantId("mal");
    const j = getResolvedJurisdiction();
    expect(j.code).toBe("JP");
    expect(j.display.code).toBe("ja");
    expect(j.legalSystemLabel).toBe("日本法");
  });

  it("US tenant defaults to Delaware subdivision", () => {
    setTenantId("us-demo");
    const j = getResolvedJurisdiction();
    expect(j.code).toBe("US");
    expect(j.legalSubdivision).toBe("DE");
    expect(j.display.code).toBe("en");
    expect(j.legalSystemLabel).toMatch(/Delaware/i);
  });

  it("STEWARD_DISPLAY_LANGUAGE overrides tenant display", () => {
    setTenantId("mal");
    process.env.STEWARD_DISPLAY_LANGUAGE = "en";
    const display = getResolvedDisplayLocale();
    expect(display.code).toBe("en");
    expect(getResolvedJurisdiction().code).toBe("JP");
  });

  it("HK tenant uses HK law with en display default", () => {
    setTenantId("hk-demo");
    const j = getResolvedJurisdiction();
    expect(j.code).toBe("HK");
    expect(j.legalSystemLabel).toMatch(/Hong Kong/i);
  });

  it("EE tenant uses et display default", () => {
    setTenantId("ee-demo");
    const j = getResolvedJurisdiction();
    expect(j.code).toBe("EE");
    expect(j.display.code).toBe("et");
  });
});
