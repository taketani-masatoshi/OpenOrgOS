import { describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import { createReturnPackage } from "../src/lib/etax/return-package.js";
import { assertRegisteredFormField, generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { officialXsdAvailable } from "../src/lib/etax/spec-paths.js";
import { resolveOfficialXsd } from "../src/lib/etax/spec-fetch.js";
import { validateXmlAgainstXsd, xmlLintAvailable } from "../src/lib/etax/xml-validate.js";
import { validateEtaxDocument } from "../src/lib/etax/validate-layers.js";
import { defaultEtaxSpecFetchIds } from "../src/lib/etax/spec-fetch.js";
import { ETAX_REQUIRED_SPEC_ARTIFACT_IDS } from "../src/lib/etax/constants.js";

describe("HOA110 body mapping", () => {
  it("emits registered body fields and refuses an empty HOA110 tag", () => {
    const xml = generateOfficialXml(packageFor());
    expect(xml).toContain("<AAA00010 ");
    expect(xml).toContain('IDREF="TEISYUTSU_DAY"');
    expect(xml).not.toMatch(/<HOA110[^>]*\/>/);
  });

  it("fails closed when a required body field or an unregistered form is missing", () => {
    const pkg = packageFor();
    pkg.payload = { ...(pkg.payload as object), hoa110: {} };
    expect(() => generateOfficialXml(pkg)).toThrow(EtaxException);
    expect(() => assertRegisteredFormField("RHO0010", "HOA410")).toThrow(EtaxException);
    expect(() => assertRegisteredFormField("RHO0010", "HOA110", "NOT_A_FIELD")).toThrow(
      EtaxException
    );
  });

  it("passes official XSD when the CAB is present, otherwise SPEC_BLOCKED", () => {
    const pkg = packageFor();
    const xml = generateOfficialXml(pkg);
    if (!officialXsdAvailable() || !xmlLintAvailable()) {
      const report = validateEtaxDocument({ pkg, xml, env: "mock" });
      expect(report.layers.find((row) => row.layer === "structural")?.status).toBe("SPEC_BLOCKED");
      return;
    }
    const xsd = validateXmlAgainstXsd(xml, resolveOfficialXsd("hojin/RHO0010-150.xsd"));
    expect(xsd).toEqual({ ok: true });
  });

  it("fetches every required CAB id by default", () => {
    for (const id of ETAX_REQUIRED_SPEC_ARTIFACT_IDS) {
      expect(defaultEtaxSpecFetchIds()).toContain(id);
    }
  });
});

function packageFor() {
  return createReturnPackage(
    {
      taxpayerId: "TP-HOA",
      procedureCode: "RHO0010",
      taxYear: "FY2026",
      revision: 0,
      createdBy: "test",
      payload: {
        it: {
          zeimushoCd: "01101",
          zeimushoNm: "麹町",
          nozeishaId: "0000000000000001",
          nozeishaNm: "テスト株式会社",
          nozeishaAdr: "東京都千代田区",
          procedureCd: "RHO0010",
          sakuseiDay: "2026-03-31",
        },
        hoa110: { teishutsuDay: "2026-03-31" },
      },
      specVersion: "KSK2-2026-08-28",
    },
    { id: "ETAX-PKG-hoa110", now: "2026-09-21T00:00:00.000Z" }
  );
}
