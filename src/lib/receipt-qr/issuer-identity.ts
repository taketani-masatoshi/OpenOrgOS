/**
 * Receipt issuer identity from the active tenant (never from request input).
 * Path: src/lib/receipt-qr/issuer-identity.ts
 */
import { loadCompany, loadTaxProfile } from "../data.js";
import { loadTenantConfig } from "../tenant.js";

export type ReceiptIssuerIdentity = {
  issuer_name: string;
  invoice_registration_number: string;
  corporate_number: string;
  source: {
    name: "company.yaml" | "tenant.yaml";
    invoice_registration: "tax-profile" | "corporate_number";
  };
};

/**
 * Resolve issuer display name + T番号 from the active tenant.
 * JP: 適格請求書発行事業者登録番号 = `T` + 法人番号（13桁）.
 * Operator Console session is already scoped to one tenant (Google ID → operator
 * → ORGOS_TENANT); callers must not accept free-form issuer fields from the UI.
 */
export function resolveReceiptIssuerIdentity(): ReceiptIssuerIdentity {
  const company = loadCompany();
  const tenant = loadTenantConfig();
  const issuerName =
    company.name?.trim() ||
    tenant.legal_name?.trim() ||
    tenant.display_name?.trim() ||
    "";
  if (!issuerName) {
    throw new Error(
      "Company name missing: set name in data/company.yaml (or legal_name in tenant.yaml)",
    );
  }

  const corporateNumber = company.corporate_number?.trim() ?? "";
  if (!/^\d{13}$/.test(corporateNumber)) {
    throw new Error(
      "corporate_number (13 digits) required in data/company.yaml to issue receipts",
    );
  }

  let invoiceRegistration = `T${corporateNumber}`;
  let invoiceSource: ReceiptIssuerIdentity["source"]["invoice_registration"] =
    "corporate_number";
  try {
    const tax = loadTaxProfile() as {
      consumption_tax?: { invoice_registration_number?: string };
    };
    const fromTax = tax.consumption_tax?.invoice_registration_number?.trim();
    if (fromTax) {
      if (!/^T\d{13}$/.test(fromTax)) {
        throw new Error(
          `Invalid consumption_tax.invoice_registration_number in tax-profile: ${fromTax}`,
        );
      }
      if (fromTax !== `T${corporateNumber}`) {
        throw new Error(
          `invoice_registration_number ${fromTax} must equal T + corporate_number ${corporateNumber}`,
        );
      }
      invoiceRegistration = fromTax;
      invoiceSource = "tax-profile";
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Invalid consumption_tax") ||
        error.message.startsWith("invoice_registration_number"))
    ) {
      throw error;
    }
    // Missing or non-JP tax-profile: fall back to T + corporate_number.
  }

  return {
    issuer_name: issuerName,
    invoice_registration_number: invoiceRegistration,
    corporate_number: corporateNumber,
    source: {
      name: company.name?.trim() ? "company.yaml" : "tenant.yaml",
      invoice_registration: invoiceSource,
    },
  };
}
