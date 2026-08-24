/**
 * REG-005 invoice / addressee gates for personal expense claims (ADR 0032).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  invoiceRegistrationCatalogSchema,
  type InvoiceRegistrationCatalog,
} from "../../../schemas/finance/invoice-registration-catalog.js";
import { loadCompany } from "../data.js";
import type { SignedReceiptQrPayload } from "../../../schemas/receipt-qr.js";
import { getClock } from "../runtime-context.js";
import { getDataDir, readYamlFile, writeYamlFile } from "../utils.js";

const CATALOG_REL = "finance/invoice-registration-catalog.yaml";

export function loadInvoiceRegistrationCatalog(): InvoiceRegistrationCatalog {
  const path = join(getDataDir(), CATALOG_REL);
  if (!existsSync(path)) {
    return invoiceRegistrationCatalogSchema.parse({
      version: 1,
      registrations: [],
    });
  }
  return readYamlFile(path, invoiceRegistrationCatalogSchema);
}

export type ExpenseClaimInvoiceVerification = {
  status: "verified" | "format_only";
  verified_as_of?: string;
  source_ref?: string;
  warning?: string;
};

export function evaluateInvoiceRegistration(
  tNumber: string,
): ExpenseClaimInvoiceVerification {
  const row = loadInvoiceRegistrationCatalog().registrations.find(
    (entry) => entry.t_number === tNumber,
  );
  if (row?.status === "revoked") {
    throw new Error(
      `blocked_invoice: T番号 ${tNumber} はオフラインカタログで revoked です`,
    );
  }
  if (row?.status === "verified") {
    return {
      status: "verified",
      verified_as_of: row.verified_as_of,
      source_ref: row.source_ref,
    };
  }
  return {
    status: "format_only",
    verified_as_of: row?.verified_as_of,
    source_ref: row?.source_ref,
    warning:
      "T番号は形式のみ確認済みです。オフラインカタログ上の登録状態は verified ではありません。",
  };
}

export function invoiceCatalogFreshnessWarnings(): string[] {
  const now = getClock().now();
  const catalog = loadInvoiceRegistrationCatalog();
  const warnings: string[] = [];
  if (
    catalog.next_review_by &&
    catalog.next_review_by < now.toISOString().slice(0, 10)
  ) {
    warnings.push(
      `invoice registration catalog review overdue since ${catalog.next_review_by}`,
    );
  }
  if (!catalog.source_checked_at || !catalog.official_source_url) {
    warnings.push(
      "invoice registration catalog source metadata is incomplete (source_checked_at / official_source_url)",
    );
  }
  warnings.push(
    ...catalog.registrations.flatMap((row) => {
      const verified = new Date(`${row.verified_as_of}T00:00:00.000Z`);
      const ageDays = Math.floor(
        (now.getTime() - verified.getTime()) / 86_400_000,
      );
      return ageDays > 365
        ? [`${row.t_number}: catalog verification is ${ageDays} days old`]
        : [];
    }),
  );
  return warnings;
}

export type InvoiceCatalogFreshness = {
  fresh: boolean;
  warnings: string[];
  source_checked_at?: string;
  next_review_by?: string;
  official_source_url?: string;
};

export function assessInvoiceCatalogFreshness(): InvoiceCatalogFreshness {
  const catalog = loadInvoiceRegistrationCatalog();
  const warnings = invoiceCatalogFreshnessWarnings();
  return {
    fresh: warnings.length === 0,
    warnings,
    source_checked_at: catalog.source_checked_at,
    next_review_by: catalog.next_review_by,
    official_source_url: catalog.official_source_url,
  };
}

function parseCatalogCsv(content: string): unknown[] {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) return [];
  const headers = rows[0]!.split(",").map((value) => value.trim());
  return rows.slice(1).map((row) => {
    const values = row.split(",").map((value) => value.trim());
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

export function importInvoiceRegistrationCatalog(input: {
  file: string;
  officialSourceUrl: string;
  dryRun?: boolean;
}): InvoiceRegistrationCatalog {
  const raw = readFileSync(input.file, "utf8");
  const parsed = input.file.toLowerCase().endsWith(".csv")
    ? parseCatalogCsv(raw)
    : JSON.parse(raw);
  const sourceRows = Array.isArray(parsed)
    ? parsed
    : ((parsed as { registrations?: unknown[] }).registrations ?? []);
  const now = getClock().now();
  const checkedAt = now.toISOString();
  const nextReview = new Date(now);
  nextReview.setUTCFullYear(nextReview.getUTCFullYear() + 1);
  const catalog = invoiceRegistrationCatalogSchema.parse({
    version: 1,
    as_of: checkedAt.slice(0, 10),
    source_checked_at: checkedAt,
    next_review_by: nextReview.toISOString().slice(0, 10),
    official_source_url: input.officialSourceUrl,
    registrations: sourceRows,
  });
  if (!input.dryRun) {
    writeYamlFile(join(getDataDir(), CATALOG_REL), catalog);
  }
  return catalog;
}

/**
 * NTA-style corporate number check digit (C + 12-digit body, left weights 1,2,…).
 * Some tenant fixtures may not satisfy this; production issuers should.
 */
export function isValidCorporateNumber(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  const check = Number(digits[0]);
  const body = digits.slice(1);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(body[i]);
    const weight = i % 2 === 0 ? 1 : 2;
    sum += d * weight;
  }
  const expected = 9 - (sum % 9);
  return check === expected;
}

export function isValidInvoiceRegistrationNumberFormat(value: string): boolean {
  return /^T\d{13}$/.test(value);
}

/** Build a valid 13-digit corporate number for fixtures (body = 12 digits). */
export function corporateNumberWithCheckDigit(body12: string): string {
  if (!/^\d{12}$/.test(body12)) {
    throw new Error("body must be 12 digits");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(body12[i]);
    const weight = i % 2 === 0 ? 1 : 2;
    sum += d * weight;
  }
  const cd = 9 - (sum % 9);
  return `${cd}${body12}`;
}

export function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/㈱/g, "株式会社")
    .replace(/\(株\)/g, "株式会社")
    .replace(/（株）/g, "株式会社")
    .toLowerCase();
}

export function recipientMatchesCompany(
  recipientName: string,
  companyName: string,
): boolean {
  const a = normalizeCompanyName(recipientName);
  const b = normalizeCompanyName(companyName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Hard gate before propose: 宛名（REG-005）+ 適格請求書発行事業者登録番号.
 * T番号は形式（T+13桁）を必須。チェックデジットは警告対象に留めず、
 * 自社番号との一致（自己発行）のみ拒否する。
 */
export function assertExpenseClaimInvoiceCompliance(
  payload: SignedReceiptQrPayload,
): {
  recipient_name: string;
  invoice_registration_number: string;
  invoice_verification: ExpenseClaimInvoiceVerification;
} {
  const receipt = payload.receipt;
  const company = loadCompany();
  const recipient = receipt.recipient_name?.trim();
  if (!recipient) {
    throw new Error(
      "blocked_invoice: 宛名（recipient_name）が必要です（REG-005 第4条 · 原則として自社法人名）",
    );
  }
  if (!recipientMatchesCompany(recipient, company.name)) {
    throw new Error(
      `blocked_invoice: 宛名「${recipient}」が自社名「${company.name}」と一致しません（REG-005 第4条）`,
    );
  }

  const tNumber = receipt.issuer.invoice_registration_number?.trim();
  if (!tNumber) {
    throw new Error(
      "blocked_invoice: 適格請求書発行事業者登録番号（T番号）が必要です（REG-005 第4条）",
    );
  }
  if (!isValidInvoiceRegistrationNumberFormat(tNumber)) {
    throw new Error(
      `blocked_invoice: T番号「${tNumber}」は T + 13桁数字である必要があります`,
    );
  }

  const ourDigits = (company.corporate_number ?? "").replace(/^T/, "");
  const issuerDigits = tNumber.slice(1);
  if (ourDigits && issuerDigits === ourDigits) {
    throw new Error(
      "blocked_invoice: 発行者T番号が自社登録番号と同じです（自己発行証憑は精算できません）",
    );
  }

  return {
    recipient_name: recipient,
    invoice_registration_number: tNumber,
    invoice_verification: evaluateInvoiceRegistration(tNumber),
  };
}
