import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { setTenantId } from "../src/lib/tenant.js";
import {
  AIA_DELIVERY_DESCRIPTION,
  assertDocumentExportAllowed,
  buildDriveDeliveryMetadata,
} from "../src/lib/integrations/gdrive-export.js";

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

  it("labels the upload as an AIA copy and does not pull or delete", () => {
    expect(buildDriveDeliveryMetadata("executive-tasks.pdf", "folder-1")).toEqual({
      name: "AIA-executive-tasks.pdf",
      parents: ["folder-1"],
      description: AIA_DELIVERY_DESCRIPTION,
    });
    expect(buildDriveDeliveryMetadata("AIA-executive-tasks.pdf", "folder-1").name).toBe(
      "AIA-executive-tasks.pdf",
    );
    expect(AIA_DELIVERY_DESCRIPTION).toContain("正本ではない");

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/lib/integrations/gdrive-export.ts"),
      "utf8",
    );
    expect(source).not.toContain("files.delete");
    expect(source).not.toContain("alt=media");
    expect(source).not.toMatch(/method:\s*"DELETE"/);
  });
});
