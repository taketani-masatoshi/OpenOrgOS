import { existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
  cashflowExportTemplateSchema,
  collectionTermsFileSchema,
  paymentCalendarFileSchema,
  reconciliationEventFileSchema,
  type ArApLedgerFile,
  type BankStatementFile,
  type CashflowExportTemplate,
  type CollectionTermsFile,
  type PaymentCalendarFile,
  type ReconciliationEventFile,
} from "../../../../../../schemas/jp-bank-corporate.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { getDataDir, readYamlFile } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_bank_corporate";

const FINANCE_FILES = {
  paymentCalendar: "payment-calendar.yaml",
  arApLedger: "ar-ap-ledger.yaml",
  collectionTerms: "collection-terms.yaml",
  bankStatements: "bank-statements.yaml",
  reconciliationEvents: "reconciliation-events.yaml",
} as const;

function financePath(filename: string): string {
  return join(getDataDir(), "finance", filename);
}

function seedPath(filename: string): string {
  return join(getModuleSeedDir(MODULE_ID), filename);
}

function loadFinanceFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { path: string; data: z.output<S> } | null {
  const tenantPath = financePath(filename);
  if (existsSync(tenantPath)) {
    return { path: tenantPath, data: readYamlFile(tenantPath, schema) };
  }
  const examplePath = `${tenantPath}.example`;
  if (existsSync(examplePath)) {
    return { path: examplePath, data: readYamlFile(examplePath, schema) };
  }
  const seedExample = seedPath(`${filename}.example`);
  if (existsSync(seedExample)) {
    return { path: seedExample, data: readYamlFile(seedExample, schema) };
  }
  const seedPlain = seedPath(filename);
  if (existsSync(seedPlain)) {
    return { path: seedPlain, data: readYamlFile(seedPlain, schema) };
  }
  return null;
}

export function loadPaymentCalendar(): { path: string; data: PaymentCalendarFile } | null {
  return loadFinanceFile(FINANCE_FILES.paymentCalendar, paymentCalendarFileSchema);
}

export function loadArApLedger(): { path: string; data: ArApLedgerFile } | null {
  return loadFinanceFile(FINANCE_FILES.arApLedger, arApLedgerFileSchema);
}

export function loadCollectionTerms(): { path: string; data: CollectionTermsFile } | null {
  return loadFinanceFile(FINANCE_FILES.collectionTerms, collectionTermsFileSchema);
}

export function loadBankStatements(): { path: string; data: BankStatementFile } | null {
  return loadFinanceFile(FINANCE_FILES.bankStatements, bankStatementFileSchema);
}

export function loadReconciliationEvents(): {
  path: string;
  data: ReconciliationEventFile;
} | null {
  return loadFinanceFile(
    FINANCE_FILES.reconciliationEvents,
    reconciliationEventFileSchema
  );
}

export function loadCashflowExportTemplate(
  id: string
): { path: string; data: CashflowExportTemplate } {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Error(`Invalid export template id: ${id}`);
  }
  const tenantPath = financePath(`export-templates/${id}.yaml`);
  const seedExample = seedPath(`export-templates/${id}.yaml.example`);
  const path = existsSync(tenantPath) ? tenantPath : seedExample;
  if (!existsSync(path)) throw new Error(`Unknown export template: ${id}`);
  const data = readYamlFile(path, cashflowExportTemplateSchema);
  if (data.id !== id) {
    throw new Error(`Export template id mismatch: expected ${id}, got ${data.id}`);
  }
  return { path, data };
}

export function resolveFinanceFilePath(filename: string): string {
  return financePath(filename);
}
