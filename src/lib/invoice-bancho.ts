import {
  invoiceEmailsDir,
  invoiceFiscalYearDir,
  invoiceOutputDir,
  resolveBillingConfig,
} from "./invoice-config.js";
import { runInvoiceGenerate, type InvoiceGenerateOptions } from "./invoice-generate.js";

/** @deprecated use resolveBillingConfig + invoiceOutputDir */
export function banchoFiscalYearDir(fiscalYear: string): string {
  const billing = resolveBillingConfig("rental", "PROP-001");
  return invoiceFiscalYearDir(billing.docs_base, fiscalYear);
}

/** @deprecated use invoiceOutputDir */
export function banchoOutputDir(fiscalYear: string): string {
  const billing = resolveBillingConfig("rental", "PROP-001");
  return invoiceOutputDir(billing.docs_base, fiscalYear);
}

/** @deprecated use invoiceEmailsDir */
export function banchoEmailsDir(fiscalYear: string): string {
  const billing = resolveBillingConfig("rental", "PROP-001");
  return invoiceEmailsDir(billing.docs_base, fiscalYear);
}

export type BanchoInvoiceRunOptions = InvoiceGenerateOptions;
export type BanchoInvoiceRunResult = Awaited<ReturnType<typeof runBanchoInvoices>>;

export async function runBanchoInvoices(options: Omit<InvoiceGenerateOptions, "moduleId" | "propertyId">) {
  return runInvoiceGenerate({
    moduleId: "rental",
    propertyId: "PROP-001",
    ...options,
  });
}

export { runInvoiceGenerate };
