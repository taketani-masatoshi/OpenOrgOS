import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculateCorporateLocalTax } from "../src/lib/finance/corporate-local-tax.js";

const source = "official local-tax rate fixture";
const profile = {
  schema: "orgos.jp.corporate-local-tax-rate.v1" as const, id: "fixture-rate", municipality_code: "13101",
  effective_from: "2026-04-01", effective_to: "2027-03-31", source_url: "https://example.invalid/official-rate",
  checked_at: "2026-09-21T00:00:00.000Z", source_sha256: createHash("sha256").update(source).digest("hex"), certified: true as const,
  resident_tax: { prefectural_corporate_tax_bps: 100, municipal_corporate_tax_bps: 600, per_capita_yen: 70000 },
  enterprise_tax_brackets: [{ up_to_yen: 4000000, rate_bps: 350 }, { up_to_yen: null, rate_bps: 700 }],
  special_corporate_business_tax_bps: 2600,
};

describe("corporate local tax calculation", () => {
  const root = mkdtempSync(join(tmpdir(), "local-tax-rate-"));
  const sourceDocumentPath = join(root, "rate.pdf");
  writeFileSync(sourceDocumentPath, source);
  it("uses only a certified, effective municipality rate profile", () => {
    const result = calculateCorporateLocalTax({ profile, sourceDocumentPath, trustedProfileIds: [profile.id], fiscalYearEnd: "2027-03-31", nationalCorporateTaxYen: 1000000, taxableIncomeYen: 5000000 });
    expect(result.total_yen).toBeGreaterThan(0);
    expect(result.calculation_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects stale rate data", () => {
    expect(() => calculateCorporateLocalTax({ profile, sourceDocumentPath, trustedProfileIds: [profile.id], fiscalYearEnd: "2028-03-31", nationalCorporateTaxYen: 1, taxableIncomeYen: 1 })).toThrow(/not effective/);
  });
  it("fails closed for unverified rates and unsupported statutory scope", () => {
    expect(() => calculateCorporateLocalTax({ profile, sourceDocumentPath, trustedProfileIds: [], fiscalYearEnd: "2027-03-31", nationalCorporateTaxYen: 1, taxableIncomeYen: 1 })).toThrow(/trusted catalog/);
    expect(() => calculateCorporateLocalTax({ profile, sourceDocumentPath, trustedProfileIds: [profile.id], fiscalYearEnd: "2027-03-31", nationalCorporateTaxYen: 1, taxableIncomeYen: 1, operationalScope: { officeCount: 2 } })).toThrow(/multiple-office/);
  });
});
