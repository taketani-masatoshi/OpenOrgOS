import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadCompany, loadProperties } from "./data.js";
import { DOCS_DIR, monthRange } from "./utils.js";
import {
  BANK_ACCOUNT_PLACEHOLDER,
  TENANT_EMAIL_PLACEHOLDER,
  TENANT_NAME_PLACEHOLDER,
  writeInvoiceEmailArtifacts,
  type RentInvoiceEmailInput,
} from "./invoice-email.js";
import {
  companyInvoiceRegistrationNumber,
  generateRentInvoicePdf,
  type RentInvoiceInput,
} from "./invoice-pdf.js";

export const BANCHO_INVOICE_BASE = join(
  DOCS_DIR,
  "operations",
  "accounting",
  "invoices",
  "bancho"
);

export function banchoFiscalYearDir(fiscalYear: string): string {
  return join(BANCHO_INVOICE_BASE, fiscalYear.toUpperCase());
}

export function banchoOutputDir(fiscalYear: string): string {
  return join(banchoFiscalYearDir(fiscalYear), "output");
}

export function banchoEmailsDir(fiscalYear: string): string {
  return join(banchoFiscalYearDir(fiscalYear), "emails");
}

export interface BanchoInvoiceRunOptions {
  from: string;
  to: string;
  fiscalYear?: string;
  tenantName?: string;
  tenantEmail?: string;
  bankAccount?: string;
  senderEmail?: string;
}

export interface BanchoInvoiceRunResult {
  fiscalYear: string;
  months: string[];
  files: {
    month: string;
    pdf: string;
    emailMd: string;
    eml: string;
    msg: string;
  }[];
}

function resolveFy(from: string, fiscalYear?: string): string {
  return (fiscalYear ?? "FY2026").toUpperCase();
}

export async function runBanchoInvoices(
  options: BanchoInvoiceRunOptions
): Promise<BanchoInvoiceRunResult> {
  const fiscalYear = resolveFy(options.from, options.fiscalYear);
  const months = monthRange(options.from, options.to);
  if (months.length === 0) {
    throw new Error(`Invalid month range: ${options.from} .. ${options.to}`);
  }

  const company = loadCompany();
  const properties = loadProperties();
  const prop = properties.find((p) => p.id === "PROP-001");
  if (!prop) {
    throw new Error("PROP-001 (番町ハイム312) not found in properties data");
  }

  const monthlyRent = prop.rental?.monthly_rent ?? 100_000;
  const tenantName = options.tenantName ?? TENANT_NAME_PLACEHOLDER;
  const tenantEmail = options.tenantEmail ?? TENANT_EMAIL_PLACEHOLDER;
  const bankAccount = options.bankAccount ?? BANK_ACCOUNT_PLACEHOLDER;
  const senderEmail = options.senderEmail ?? "info@malkk.com";

  const outputDir = banchoOutputDir(fiscalYear);
  const emailsDir = banchoEmailsDir(fiscalYear);
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(emailsDir, { recursive: true });

  const invoiceRegistration = companyInvoiceRegistrationNumber(company.corporate_number);
  const files: BanchoInvoiceRunResult["files"] = [];

  for (const billingMonth of months) {
    const base = billingMonth;
    const pdfFilename = `${base}-invoice.pdf`;
    const pdfPath = join(outputDir, pdfFilename);

    const invoiceInput: RentInvoiceInput = {
      billingMonth,
      monthlyRent,
      tenantName,
      propertyName: prop.name,
      propertyLocation: prop.location,
      companyName: company.name,
      companyAddress: company.address ?? "",
      invoiceRegistrationNumber: invoiceRegistration,
      bankAccount,
    };

    await generateRentInvoicePdf(invoiceInput, pdfPath);

    const emailInput: RentInvoiceEmailInput = {
      billingMonth,
      propertyName: prop.name,
      tenantName,
      tenantEmail,
      companyName: company.name,
      senderEmail,
      monthlyRent,
    };

    const artifacts = writeInvoiceEmailArtifacts(emailInput, {
      pdfPath,
      pdfFilename,
      emailMdPath: join(emailsDir, `${base}-email.md`),
      emlPath: join(outputDir, `${base}-invoice.eml`),
      msgPath: join(outputDir, `${base}-invoice.msg`),
    });

    files.push({
      month: billingMonth,
      pdf: pdfPath,
      emailMd: artifacts.md,
      eml: artifacts.eml,
      msg: artifacts.msg,
    });
  }

  return { fiscalYear, months, files };
}
