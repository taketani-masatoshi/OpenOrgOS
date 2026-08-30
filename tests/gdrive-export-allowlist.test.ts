import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import { assertDocumentExportAllowed } from "../src/lib/integrations/gdrive-export.js";

/**
 * Drive is outside the company boundary, so the allowlist is the last thing
 * standing between a raw L2 YAML and a shared folder.
 */
describe("drive export allowlist", () => {
  setTenantId("demo");

  it("accepts human-facing documents", () => {
    expect(assertDocumentExportAllowed("company/regulations/ringi-kessai-kisoku.md")).toBe(
      "company/regulations/ringi-kessai-kisoku.md",
    );
    expect(assertDocumentExportAllowed("docs/compliance/iso/steward-assessment.md")).toBe(
      "compliance/iso/steward-assessment.md",
    );
  });

  it("refuses raw data, records and correspondence drafts", () => {
    expect(() => assertDocumentExportAllowed("data/org/operators.yaml")).toThrow();
    expect(() => assertDocumentExportAllowed("records/executive/mail-config.yaml")).toThrow();
    expect(() =>
      assertDocumentExportAllowed("docs/executive/correspondence-drafts/DRAFT-1.md"),
    ).toThrow();
  });

  it("refuses path traversal and non-markdown files", () => {
    expect(() => assertDocumentExportAllowed("docs/company/../../etc/passwd")).toThrow();
    expect(() => assertDocumentExportAllowed("company/regulations/secret.yaml")).toThrow();
  });
});
