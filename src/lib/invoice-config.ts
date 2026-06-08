import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { ModuleBilling } from "../../schemas/modules.js";
import { invoiceTemplateSchema, type InvoiceTemplate } from "../../schemas/invoice-template.js";
import { getModuleSeedDir, loadModulesFile } from "./modules.js";
import { resolveTenantPath } from "./utils.js";

export interface ResolvedBilling extends ModuleBilling {
  moduleId: string;
  propertyId: string;
}

export function resolveBillingConfig(moduleId: string, propertyId: string): ResolvedBilling {
  const mod = loadModulesFile().modules.find((m) => m.id === moduleId);
  if (!mod) {
    throw new Error(`Module "${moduleId}" not found in modules.yaml`);
  }
  if (!mod.enabled) {
    throw new Error(`Module "${moduleId}" is disabled`);
  }
  const billing = mod.billing?.[propertyId];
  if (!billing) {
    throw new Error(
      `No billing config for ${propertyId} on module "${moduleId}" — add billing.${propertyId} to modules.yaml`
    );
  }
  if (mod.property_ids && !mod.property_ids.includes(propertyId)) {
    throw new Error(`Property ${propertyId} is not bound to module "${moduleId}"`);
  }
  return { ...billing, moduleId, propertyId };
}

export function invoiceFiscalYearDir(docsBase: string, fiscalYear: string): string {
  return resolveTenantPath(`${docsBase.replace(/\/$/, "")}/${fiscalYear.toUpperCase()}`);
}

export function invoiceOutputDir(docsBase: string, fiscalYear: string): string {
  return join(invoiceFiscalYearDir(docsBase, fiscalYear), "output");
}

export function invoiceEmailsDir(docsBase: string, fiscalYear: string): string {
  return join(invoiceFiscalYearDir(docsBase, fiscalYear), "emails");
}

export function loadInvoiceTemplate(moduleId: string, templateId: string): InvoiceTemplate {
  const seedDir = getModuleSeedDir(moduleId);
  const path = join(seedDir, `invoice-${templateId}.yaml`);
  if (!existsSync(path)) {
    throw new Error(
      `Invoice template not found: steward/modules/${moduleId}/seed/invoice-${templateId}.yaml`
    );
  }
  return invoiceTemplateSchema.parse(YAML.parse(readFileSync(path, "utf-8")));
}

export function loadInvoiceBodyTemplate(
  moduleId: string,
  template: InvoiceTemplate
): string | undefined {
  const file = template.email.body_template;
  if (!file) return undefined;
  const path = join(getModuleSeedDir(moduleId), file);
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf-8");
}

export interface TemplateVars {
  property_name: string;
  property_location: string;
  year_month: string;
  tenant_name: string;
  company_name: string;
  monthly_rent: string;
  due_date: string;
  sender_email: string;
}

export function interpolateTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = vars[key as keyof TemplateVars];
    return val ?? `{${key}}`;
  });
}
