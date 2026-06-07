import { describe, it, expect } from "vitest";
import {
  billingMonthEndDate,
  formatJapaneseYearMonth,
  invoiceNumber,
  paymentDueDate,
} from "../src/lib/invoice-dates.js";
import {
  buildInvoiceEmailSubject,
  buildInvoiceEmailBody,
  TENANT_NAME_PLACEHOLDER,
} from "../src/lib/invoice-email.js";
import {
  buildRentInvoiceRows,
  companyInvoiceRegistrationNumber,
} from "../src/lib/invoice-pdf.js";

describe("invoice dates", () => {
  it("computes month-end issue date", () => {
    expect(billingMonthEndDate("2026-02")).toBe("2026-02-28");
    expect(billingMonthEndDate("2027-01")).toBe("2027-01-31");
  });

  it("computes payment due as next month end", () => {
    expect(paymentDueDate("2026-02")).toBe("2026-03-31");
    expect(paymentDueDate("2027-01")).toBe("2027-02-28");
  });

  it("formats invoice number", () => {
    expect(invoiceNumber("2026-06")).toBe("INV-BANCHO-2026-06");
  });
});

describe("invoice content", () => {
  it("builds registration number from corporate number", () => {
    expect(companyInvoiceRegistrationNumber("4010001189530")).toBe("T4010001189530");
    expect(companyInvoiceRegistrationNumber("T4010001189530")).toBe("T4010001189530");
  });

  it("builds rent rows with non-taxable note", () => {
    const rows = buildRentInvoiceRows({
      billingMonth: "2026-02",
      monthlyRent: 100_000,
      tenantName: TENANT_NAME_PLACEHOLDER,
      propertyName: "番町ハイム312",
      propertyLocation: "東京都千代田区二番町",
      companyName: "株式会社MAL",
      companyAddress: "〒102-0084",
      invoiceRegistrationNumber: "T4010001189530",
      bankAccount: "[振込先口座 TBD]",
    });
    expect(rows[0].label).toContain(formatJapaneseYearMonth("2026-02"));
    expect(rows[0].amount).toBe(100_000);
    expect(rows.at(-1)?.amount).toBe(100_000);
  });

  it("builds Japanese email subject and body", () => {
    const input = {
      billingMonth: "2026-02",
      propertyName: "番町ハイム312",
      tenantName: TENANT_NAME_PLACEHOLDER,
      tenantEmail: "[送付先メール TBD]",
      companyName: "株式会社MAL",
      senderEmail: "info@malkk.com",
      monthlyRent: 100_000,
    };
    expect(buildInvoiceEmailSubject(input)).toBe(
      "【ご請求】番町ハイム312 2026年2月分賃料"
    );
    const body = buildInvoiceEmailBody(input);
    expect(body).toContain("100,000円");
    expect(body).toContain("2026年3月31日");
  });
});
