import {
  arApLedgerFileSchema,
  bankStatementFileSchema,
  cashflowExportTemplateSchema,
  collectionTermsFileSchema,
  paymentCalendarFileSchema,
  reconciliationEventFileSchema,
} from "../../../../../../schemas/jp-bank-corporate.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const seedDir = dirname(fileURLToPath(import.meta.url));

function loadExample(name: string) {
  const path = join(seedDir, `${name}.yaml.example`);
  if (!existsSync(path)) throw new Error(`Missing seed example: ${name}`);
  return YAML.parse(readFileSync(path, "utf-8"));
}

function loadExportExample(name: string) {
  const path = join(seedDir, "export-templates", `${name}.yaml.example`);
  if (!existsSync(path)) throw new Error(`Missing export template: ${name}`);
  return YAML.parse(readFileSync(path, "utf-8"));
}

export function validateModuleSeeds(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    paymentCalendarFileSchema.parse(loadExample("payment-calendar"));
  } catch (e) {
    errors.push(`payment-calendar: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    arApLedgerFileSchema.parse(loadExample("ar-ap-ledger"));
  } catch (e) {
    errors.push(`ar-ap-ledger: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    collectionTermsFileSchema.parse(loadExample("collection-terms"));
  } catch (e) {
    errors.push(`collection-terms: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    bankStatementFileSchema.parse(loadExample("bank-statements"));
  } catch (e) {
    errors.push(`bank-statements: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    reconciliationEventFileSchema.parse(loadExample("reconciliation-events"));
  } catch (e) {
    errors.push(
      `reconciliation-events: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  for (const name of ["cash-book-csv", "mizuho-weekly", "tax-payment-csv"]) {
    try {
      cashflowExportTemplateSchema.parse(loadExportExample(name));
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
