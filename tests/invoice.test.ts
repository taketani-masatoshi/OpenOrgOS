// @catalog-ids: rental
import { describe, it, expect } from "vitest";
import { existsSync, rmSync } from "node:fs";
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
import {
  invoiceOutputDir,
  loadInvoiceTemplate,
  resolveBillingConfig,
} from "../src/lib/invoice-config.js";
import { runInvoiceGenerate } from "../src/lib/invoice-generate.js";
import { loadJournalEntries } from "../src/lib/finance/expense-claim-journal.js";

describe("invoice dates", () => {
  it("computes month-end issue date", () => {
    expect(billingMonthEndDate("2026-02")).toBe("2026-02-28");
    expect(billingMonthEndDate("2027-01")).toBe("2027-01-31");
  });

  it("computes payment due as next month end", () => {
    expect(paymentDueDate("2026-02")).toBe("2026-03-31");
    expect(paymentDueDate("2027-01")).toBe("2027-02-28");
  });

  it("formats invoice number with configurable prefix", () => {
    expect(invoiceNumber("2026-06")).toBe("INV-RENT-2026-06");
    expect(invoiceNumber("2026-06", "BANCHO")).toBe("INV-BANCHO-2026-06");
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
      invoiceNumberPrefix: "BANCHO",
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

  it("loads rental invoice template from module seed", () => {
    const tpl = loadInvoiceTemplate("rental", "rent-monthly");
    expect(tpl.id).toBe("rent-monthly");
    expect(tpl.email.subject).toContain("{property_name}");
  });
});

describe("invoice generate (MAL bancho)", () => {
  it("resolves FY2026 bancho output path from modules.yaml billing", () => {
    const billing = resolveBillingConfig("rental", "PROP-001");
    expect(billing.docs_base).toBe("docs/finance/accounting/invoices/bancho");
    expect(billing.invoice_number_prefix).toBe("BANCHO");
    const out = invoiceOutputDir(billing.docs_base, "FY2026");
    expect(out).toContain("finance/accounting/invoices/bancho/FY2026/output");
  });

  it("E2E generates single-month invoice to bancho FY path", async () => {
    const billing = resolveBillingConfig("rental", "PROP-001");
    const outDir = invoiceOutputDir(billing.docs_base, "FY2099");
    const result = await runInvoiceGenerate({
      moduleId: "rental",
      propertyId: "PROP-001",
      from: "2099-01",
      to: "2099-01",
      fiscalYear: "FY2099",
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].pdf).toContain("bancho/FY2099/output/2099-01-invoice.pdf");
    expect(existsSync(result.files[0].pdf)).toBe(true);
    expect(existsSync(result.files[0].eml)).toBe(true);
    rmSync(outDir, { recursive: true, force: true });
  });
});

describe("invoice generate (MAL kamezawa hospitality)", () => {
  it("resolves FY2026 kamezawa output path from modules.yaml billing", () => {
    const billing = resolveBillingConfig("hospitality", "PROP-002");
    expect(billing.docs_base).toBe("docs/finance/accounting/invoices/kamezawa");
    expect(billing.invoice_number_prefix).toBe("STAY");
    const out = invoiceOutputDir(billing.docs_base, "FY2026");
    expect(out).toContain("finance/accounting/invoices/kamezawa/FY2026/output");
  });

  it("E2E generates hospitality invoice with consumption-tax journal split", async () => {
    const billing = resolveBillingConfig("hospitality", "PROP-002");
    const outDir = invoiceOutputDir(billing.docs_base, "FY2099");
    const tpl = loadInvoiceTemplate("hospitality", "hospitality-monthly");
    expect(tpl.pdf.tax_mode).toBe("taxable_10");

    const result = await runInvoiceGenerate({
      moduleId: "hospitality",
      propertyId: "PROP-002",
      from: "2099-01",
      to: "2099-01",
      fiscalYear: "FY2099",
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0].pdf).toContain("kamezawa/FY2099/output/2099-01-invoice.pdf");
    expect(existsSync(result.files[0].pdf)).toBe(true);

    const entry = loadJournalEntries().entries.find((e) => e.entry_id === "JE-INV-PROP-002-2099-01");
    expect(entry).toBeTruthy();
    const ar = entry!.lines.find((l) => l.account_code === "1150");
    const revenue = entry!.lines.find((l) => l.account_code === "4200");
    const consumptionTax = entry!.lines.find((l) => l.account_code === "2160");
    expect(revenue!.credit_yen).toBeLessThan(ar!.debit_yen);
    expect(consumptionTax!.credit_yen).toBeGreaterThan(0);
    expect(revenue!.credit_yen + consumptionTax!.credit_yen).toBe(ar!.debit_yen);

    rmSync(outDir, { recursive: true, force: true });
  });
});
