import { describe, expect, it, beforeEach } from "vitest";
import {
  JP_INVOICE_REGISTRATION_NUMBER_PATTERN,
  assessInvoiceRegistration,
  assessQualifiedInvoiceIssuance,
} from "../src/lib/finance/invoice-qualified.js";
import { computeTaxReadiness } from "../src/lib/finance/tax-readiness.js";
import { resolveRegisteredSkillInvocation } from "../src/commands/skills.js";
import { setTenantId } from "../src/lib/tenant.js";

describe("invoice qualified checks", () => {
  it("validates T+13 registration number pattern", () => {
    expect(JP_INVOICE_REGISTRATION_NUMBER_PATTERN.test("T4010001189530")).toBe(true);
    expect(JP_INVOICE_REGISTRATION_NUMBER_PATTERN.test("4010001189530")).toBe(false);
  });

  it("flags exempt status with registered invoice without reconciled basis", () => {
    const result = assessInvoiceRegistration({
      consumption_tax: {
        status: "免税事業者",
        invoice_registered: true,
        invoice_registration_number: "T4010001189530",
      },
    });
    expect(
      result.issues.some((i) => i.code === "invoice_exempt_reconcile"),
    ).toBe(true);
  });

  it("assessQualifiedInvoiceIssuance requires registration", () => {
    const result = assessQualifiedInvoiceIssuance({
      consumption_tax: {
        status: "課税事業者（本則）",
        invoice_registered: false,
        invoice_registration_number: "T4010001189530",
      },
    });
    expect(result.can_issue_qualified_invoice).toBe(false);
    expect(result.issues.some((i) => i.code === "not_registered")).toBe(true);
  });
});

describe("tax readiness", () => {
  beforeEach(() => {
    setTenantId("mal");
  });

  it("computes deterministic score with seven axes", () => {
    const result = computeTaxReadiness();
    expect(result.axes).toHaveLength(7);
    expect(result.max).toBe(100);
    expect(result.pct).toBeGreaterThanOrEqual(0);
    expect(result.pct).toBeLessThanOrEqual(100);
    expect(result.out_of_scope).toContain("e-Tax / eLTAX 本番提出");
  });

  it("mal machine score 100% with advisor_pending visible", () => {
    const result = computeTaxReadiness();
    expect(result.pct).toBe(100);
    expect(result.advisor_pending).toBeGreaterThan(0);
    expect(result.filing_ready).toBe(false);
  });

  it("JP tax module skills are dispatch-ready", () => {
    for (const id of [
      "jp_corporate_tax_return",
      "jp_consumption_tax_return",
      "jp_invoice_registration",
      "jp_qualified_invoice_issue",
      "jp_withholding_payment",
    ]) {
      expect(resolveRegisteredSkillInvocation(id).status).toBe("ready");
    }
  });
});
