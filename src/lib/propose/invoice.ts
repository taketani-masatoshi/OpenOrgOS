import type { InvoiceRegistrationCatalog } from "../../../schemas/finance/invoice-registration-catalog.js";

export type InvoiceCandidate = {
  tNumber?: string;
  taxCategory: "taxable_10" | "taxable_8" | "exempt" | "unknown";
  amountYen?: number;
  posting: "proposal";
};

/** Fixture parser. Does not call a live NTA API and does not post a journal. */
export function parseInvoiceFixture(text: string): InvoiceCandidate {
  const tNumber = text.match(/T\d{13}/)?.[0];
  let taxCategory: InvoiceCandidate["taxCategory"] = "unknown";
  if (/非課税|免税/.test(text)) taxCategory = "exempt";
  else if (/8%|８％|軽減/.test(text)) taxCategory = "taxable_8";
  else if (/10%|１０％|消費税/.test(text)) taxCategory = "taxable_10";
  const amount = text.match(/(\d{1,12})\s*円/);
  return {
    tNumber,
    taxCategory,
    amountYen: amount ? Number(amount[1]) : undefined,
    posting: "proposal",
  };
}

export function matchRegistration(
  catalog: InvoiceRegistrationCatalog,
  tNumber: string | undefined,
): "missing" | "verified" | "revoked" | "unknown" | "not_in_catalog" {
  if (!tNumber) return "missing";
  const row = catalog.registrations.find((item) => item.t_number === tNumber);
  if (!row) return "not_in_catalog";
  return row.status;
}

/** Journal lines are a proposal. Nothing is posted. */
export function proposeInvoiceJournal(
  text: string,
  catalog: InvoiceRegistrationCatalog,
): {
  candidate: InvoiceCandidate;
  registration: ReturnType<typeof matchRegistration>;
  lines: Array<{
    account_code: string;
    debit_yen: number;
    credit_yen: number;
    tax_category: InvoiceCandidate["taxCategory"];
  }>;
  posted: false;
} {
  const candidate = parseInvoiceFixture(text);
  const amount = candidate.amountYen ?? 0;
  const lines =
    amount > 0
      ? [
          {
            account_code: "5210",
            debit_yen: amount,
            credit_yen: 0,
            tax_category: candidate.taxCategory,
          },
          {
            account_code: "2110",
            debit_yen: 0,
            credit_yen: amount,
            tax_category: candidate.taxCategory,
          },
        ]
      : [];
  return {
    candidate,
    registration: matchRegistration(catalog, candidate.tNumber),
    lines,
    posted: false,
  };
}
