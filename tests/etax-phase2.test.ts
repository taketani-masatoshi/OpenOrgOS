import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EtaxException } from "../schemas/etax/errors.js";
import { asciiSafeRelativePath, unpackMicrosoftCab } from "../src/lib/etax/cab-unpack.js";
import { generateOfficialXml } from "../src/lib/etax/xml-generator.js";
import { createReturnPackage } from "../src/lib/etax/return-package.js";
import { validateEtaxDocument } from "../src/lib/etax/validate-layers.js";
import {
  assertWellFormedXml,
  rejectUnsafeXml,
  validateXmlAgainstXsd,
  xmlLintAvailable,
} from "../src/lib/etax/xml-validate.js";
import {
  officialXsdRoot,
  vendorCabPresent,
  etaxVendorCabPath,
} from "../src/lib/etax/spec-paths.js";
import { loadEtaxSpecManifest } from "../src/lib/etax/spec-registry.js";

const engineXsd = join("tests/fixtures/etax/engine-only.xsd");
const engineValid = readFileSync(join("tests/fixtures/etax/engine-only-valid.xml"), "utf-8");
const engineInvalid = readFileSync(join("tests/fixtures/etax/engine-only-invalid.xml"), "utf-8");

describe("etax CAB path sanitization", () => {
  it("keeps ASCII folders and strips SJIS leaf noise without colliding silently", () => {
    const used = new Set<string>();
    const a = asciiSafeRelativePath("19XMLスキーマ\\hojin\\HOA110-001.xsd", used);
    const b = asciiSafeRelativePath("07手続\\手続一覧Ver260x.xlsx", used);
    const c = asciiSafeRelativePath("07手続\\別表Ver260x.xlsx", used);
    expect(a).toBe("hojin/HOA110-001.xsd");
    expect(b).toBe("Ver260x.xlsx");
    expect(c).not.toBe(b);
    expect(c.endsWith("Ver260x.xlsx")).toBe(true);
    const escaped = asciiSafeRelativePath("19XML\\..\\etc\\passwd.xsd", new Set());
    expect(escaped.includes("..")).toBe(false);
    expect(escaped.startsWith("/")).toBe(false);
  });
});

describe("etax XML XXE / well-formedness", () => {
  it("rejects DOCTYPE entity expansion", () => {
    const xxe = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>`;
    expect(() => rejectUnsafeXml(xxe)).toThrow(EtaxException);
    try {
      rejectUnsafeXml(xxe);
    } catch (error) {
      expect((error as EtaxException).etax.blocked).toBeUndefined();
      expect((error as EtaxException).etax.code).toBe("ETAX_XML_XXE_REJECTED");
    }
  });

  it.skipIf(!xmlLintAvailable())("engine-only XSD: valid XML passes and invalid XML fails", () => {
    assertWellFormedXml(engineValid);
    const pass = validateXmlAgainstXsd(engineValid, engineXsd);
    const fail = validateXmlAgainstXsd(engineInvalid, engineXsd);
    expect(pass).toEqual({ ok: true });
    expect(fail.ok).toBe(false);
  });
});

describe("etax official KSK2 XSD (local vendor)", () => {
  const officialTek = join(officialXsdRoot(), "general/TEK000-001.xsd");
  const hasOfficial = existsSync(officialTek);

  it.skipIf(!hasOfficial || !xmlLintAvailable())(
    "rejects a non-NTA instance against official TEK000 schema",
    () => {
      const result = validateXmlAgainstXsd(
        `<?xml version="1.0" encoding="UTF-8"?><not-nta/>`,
        officialTek
      );
      expect(result.ok).toBe(false);
    }
  );

  it.skipIf(!hasOfficial || !xmlLintAvailable())(
    "accepts a minimal instance of the official TEK000 group via an OrgOS test wrapper",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "orgos-etax-xsd-"));
      try {
        const wrapper = join(dir, "wrapper.xsd");
        writeFileSync(
          wrapper,
          `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified">
  <xsd:include schemaLocation="${officialTek}"/>
  <xsd:element name="OrgOSTestRoot">
    <xsd:complexType>
      <xsd:group ref="TEK000-1-0group"/>
    </xsd:complexType>
  </xsd:element>
</xsd:schema>
`,
          "utf-8"
        );
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OrgOSTestRoot>
  <TEK000 VR="1.0" fid="COZ020" softNM="OrgOS" sakuseiNM="phase2-local-test" sakuseiDay="2026-09-20"/>
</OrgOSTestRoot>
`;
        const result = validateXmlAgainstXsd(xml, wrapper);
        expect(result).toEqual({ ok: true });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  );
});

describe("etax mapper remains fail-closed without field maps", () => {
  it("does not invent official XML", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "TEST-CORP",
        taxYear: "FY2026",
        revision: 0,
        payload: {},
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-phase2", now: "2026-09-21T00:00:00.000Z" }
    );
    try {
      generateOfficialXml(pkg);
      throw new Error("expected SPEC_BLOCKED");
    } catch (error) {
      expect(error).toBeInstanceOf(EtaxException);
      expect((error as EtaxException).etax.blocked).toBe("SPEC_BLOCKED");
    }
  });
});

describe("etax three-layer validation", () => {
  it("OrgOS layer passes hash binding while structure stays blocked without XML", () => {
    const pkg = createReturnPackage(
      {
        taxpayerId: "TP-1",
        procedureCode: "HOC-UNKNOWN",
        taxYear: "FY2026",
        revision: 0,
        payload: { n: 1 },
        createdBy: "test",
        specVersion: "KSK2-2026-08-28",
      },
      { id: "ETAX-PKG-layers", now: "2026-09-21T00:00:00.000Z" }
    );
    const report = validateEtaxDocument({ pkg, env: "mock" });
    expect(report.ok).toBe(false);
    expect(report.layers.find((row) => row.layer === "structural")?.status).toBe("SPEC_BLOCKED");
    expect(report.layers.find((row) => row.layer === "orgos")?.status).toBe("pass");
    expect(report.layers.find((row) => row.layer === "specification")?.status).toBe("fail");
  });
});

describe("etax vendor CAB unpack", () => {
  it.skipIf(!vendorCabPresent("e-tax01"))("unpacks e-tax01 with ASCII-safe relative paths", () => {
    const dest = mkdtempSync(join(tmpdir(), "orgos-etax-cab-"));
    try {
      const result = unpackMicrosoftCab(etaxVendorCabPath("e-tax01"), dest);
      expect(result.fileCount).toBeGreaterThan(0);
      expect(result.files.every((file) => !file.relativePath.includes("\0"))).toBe(true);
      expect(
        result.files.some(
          (file) =>
            file.relativePath.toLowerCase().endsWith(".xlsx") ||
            file.relativePath.toLowerCase().endsWith(".docx")
        )
      ).toBe(true);
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  });
});

describe("etax spec hashes for retrieved Phase 2 CABs", () => {
  it("records sha256 for e-tax19 when the vendor CAB is present", () => {
    const row = loadEtaxSpecManifest().artifacts.find((item) => item.id === "e-tax19");
    expect(row).toBeTruthy();
    if (vendorCabPresent("e-tax19")) {
      expect(row?.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
