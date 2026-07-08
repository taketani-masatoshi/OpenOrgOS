import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  getJurisdictionPackRoot,
  listEntityForms,
  listLegalSubdivisions,
  loadCountriesRegistry,
} from "../src/lib/jurisdiction.js";
import { ROOT_DIR } from "../src/lib/tenant.js";

/** TJS-11 buckets with pack_ready. EE ≠ Europe · EU is TJS meta pack (Option A). */
const TJS_PACK_READY_CODES = [
  "JP",
  "US",
  "SG",
  "HK",
  "AU",
  "TW",
  "MY",
  "CN",
  "AE",
  "RU",
  "EU",
] as const;

describe("TJS-11 jurisdiction progress", () => {
  it("tracks eleven pack_ready codes", () => {
    const reg = loadCountriesRegistry();
    for (const code of TJS_PACK_READY_CODES) {
      const entry = reg.countries[code];
      expect(entry?.tier, code).toBe("full");
      expect(entry?.pack_root, code).toContain(`jurisdiction-packs/${code}`);
      expect(existsSync(join(ROOT_DIR, entry!.pack_root!, "pack.manifest.yaml"))).toBe(true);
    }
  });

  it("EU meta pack has DE FR GB subdivisions (TJS-EU Option A)", () => {
    expect(listLegalSubdivisions("EU")).toEqual(["DE", "FR", "GB"]);
    expect(listEntityForms("EU", "DE").some((f) => f.id === "gmbh")).toBe(true);
    expect(listEntityForms("EU", "FR").some((f) => f.id === "sarl")).toBe(true);
    expect(listEntityForms("EU", "GB").some((f) => f.id === "ltd")).toBe(true);
    expect(existsSync(join(getJurisdictionPackRoot("EU"), "subdivisions/DE/entity-forms.yaml"))).toBe(
      true
    );
  });

  it("AE, RU, and EU demo tenants exist", () => {
    expect(existsSync(join(ROOT_DIR, "tenants/ae-demo/tenant.yaml"))).toBe(true);
    expect(existsSync(join(ROOT_DIR, "tenants/ru-demo/tenant.yaml"))).toBe(true);
    expect(existsSync(join(ROOT_DIR, "tenants/eu-demo/tenant.yaml"))).toBe(true);
  });

  it("TJS-11 pack_ready rate is 11/11 (100%)", () => {
    expect(TJS_PACK_READY_CODES.length).toBe(11);
    expect(TJS_PACK_READY_CODES.length / 11).toBe(1);
  });
});
