import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadCompany, loadProperties } from "./data.js";
import { loadOrgCompanyBilling } from "./org/tenant-data.js";
import { monthRange } from "./utils.js";
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
import {
  formatJapaneseDate,
  formatJapaneseYearMonth,
  paymentDueDate,
} from "./invoice-dates.js";
import {
  invoiceEmailsDir,
  invoiceOutputDir,
  loadInvoiceBodyTemplate,
  loadInvoiceTemplate,
  resolveBillingConfig,
  resolveBillingConfigDryRun,
  type TemplateVars,
} from "./invoice-config.js";

export interface InvoiceGenerateOptions {
  moduleId: string;
  propertyId: string;
  from: string;
  to: string;
  fiscalYear?: string;
  tenantName?: string;
  tenantEmail?: string;
  bankAccount?: string;
  senderEmail?: string;
  dryRun?: boolean;
}

export interface InvoiceGenerateResult {
  moduleId: string;
  propertyId: string;
  fiscalYear: string;
  months: string[];
  outputDir: string;
  emailsDir: string;
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

export async function runInvoiceGenerate(
  options: InvoiceGenerateOptions
): Promise<InvoiceGenerateResult> {
  const billing = options.dryRun
    ? resolveBillingConfigDryRun(options.moduleId, options.propertyId)
    : resolveBillingConfig(options.moduleId, options.propertyId);
  const fiscalYear = resolveFy(options.from, options.fiscalYear);
  const months = monthRange(options.from, options.to);
  if (months.length === 0) {
    throw new Error(`Invalid month range: ${options.from} .. ${options.to}`);
  }

  const outputDir = invoiceOutputDir(billing.docs_base, fiscalYear);
  const emailsDir = invoiceEmailsDir(billing.docs_base, fiscalYear);

  if (options.dryRun) {
    const files = months.map((billingMonth) => ({
      month: billingMonth,
      pdf: join(outputDir, `${billingMonth}-invoice.pdf`),
      emailMd: join(emailsDir, `${billingMonth}-email.md`),
      eml: join(outputDir, `${billingMonth}-invoice.eml`),
      msg: join(outputDir, `${billingMonth}-invoice.msg`),
    }));
    return {
      moduleId: options.moduleId,
      propertyId: options.propertyId,
      fiscalYear,
      months,
      outputDir,
      emailsDir,
      files,
    };
  }

  const company = loadOrgCompanyBilling();
  const properties = loadProperties();
  const prop = properties.find((p) => p.id === options.propertyId);
  if (!prop) {
    throw new Error(`Property ${options.propertyId} not found in properties data`);
  }

  const template = loadInvoiceTemplate(billing.moduleId, billing.template_id);
  const bodyTemplateText = loadInvoiceBodyTemplate(billing.moduleId, template);

  const monthlyRent = prop.rental?.monthly_rent ?? 100_000;
  const tenantName =
    options.tenantName ?? billing.tenant_name ?? template.defaults?.tenant_name ?? TENANT_NAME_PLACEHOLDER;
  const tenantEmail =
    options.tenantEmail ??
    billing.tenant_email ??
    template.defaults?.tenant_email ??
    TENANT_EMAIL_PLACEHOLDER;
  const bankAccount =
    options.bankAccount ??
    billing.bank_account ??
    template.defaults?.bank_account ??
    BANK_ACCOUNT_PLACEHOLDER;
  const senderEmail =
    options.senderEmail ??
    billing.sender_email ??
    template.defaults?.sender_email ??
    "info@malkk.com";

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(emailsDir, { recursive: true });

  const invoiceRegistration = companyInvoiceRegistrationNumber(company.corporate_number);
  const files: InvoiceGenerateResult["files"] = [];

  for (const billingMonth of months) {
    const base = billingMonth;
    const pdfFilename = `${base}-invoice.pdf`;
    const pdfPath = join(outputDir, pdfFilename);

    const templateVars: TemplateVars = {
      property_name: prop.name,
      property_location: prop.location,
      year_month: formatJapaneseYearMonth(billingMonth),
      tenant_name: tenantName,
      company_name: company.name,
      monthly_rent: new Intl.NumberFormat("ja-JP").format(monthlyRent),
      due_date: formatJapaneseDate(paymentDueDate(billingMonth)),
      sender_email: senderEmail,
    };

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
      invoiceNumberPrefix: billing.invoice_number_prefix,
      template,
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
      template,
      bodyTemplateText,
      templateVars,
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

  return {
    moduleId: options.moduleId,
    propertyId: options.propertyId,
    fiscalYear,
    months,
    outputDir,
    emailsDir,
    files,
  };
}
