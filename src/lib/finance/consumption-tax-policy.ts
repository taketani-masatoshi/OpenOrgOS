export const JP_CONSUMPTION_TAX_POLICY = {
  id: "jp-consumption-tax-2023-10",
  verified_against: [
    {
      topic: "simplified_multiple_business",
      source: "https://www.nta.go.jp/publication/pamph/shohi/aramashi/pdf/001_r02.pdf",
      checked_on: "2026-09-21",
    },
    {
      topic: "interim_filing",
      source: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6609.htm",
      checked_on: "2026-09-21",
    },
    {
      topic: "fixed_asset_adjustment",
      source: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6421.htm",
      checked_on: "2026-09-21",
    },
    {
      topic: "inventory_adjustment",
      source: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6491.htm",
      checked_on: "2026-09-21",
    },
  ],
  rates: {
    taxable_10: {
      total_rate_pct: 10,
      national_rate_numerator: 78,
      national_rate_denominator: 1_000,
    },
    taxable_8: {
      total_rate_pct: 8,
      national_rate_numerator: 624,
      national_rate_denominator: 10_000,
    },
  },
  invoice_tax_national_ratio: { numerator: 78, denominator: 100 },
  local_tax_ratio: { numerator: 22, denominator: 78 },
  filing_rounding: {
    taxable_base_unit_yen: 1_000,
    national_payable_unit_yen: 100,
    local_payable_unit_yen: 100,
  },
  nonqualified_invoice_transitions: [
    {
      status: "nonqualified_80" as const,
      from: "2023-10-01",
      to: "2026-09-30",
      credit_pct: 80,
    },
    {
      status: "nonqualified_50" as const,
      from: "2026-10-01",
      to: "2029-09-30",
      credit_pct: 50,
    },
  ],
} as const;

export type TransitionalInvoiceStatus =
  (typeof JP_CONSUMPTION_TAX_POLICY.nonqualified_invoice_transitions)[number]["status"];

export function resolveTransitionalInvoiceCredit(
  status: TransitionalInvoiceStatus,
  occurredOn: string,
): { valid: boolean; credit_pct: number } {
  const rule = JP_CONSUMPTION_TAX_POLICY.nonqualified_invoice_transitions.find(
    (candidate) => candidate.status === status,
  );
  if (!rule || occurredOn < rule.from || occurredOn > rule.to) {
    return { valid: false, credit_pct: 0 };
  }
  return { valid: true, credit_pct: rule.credit_pct };
}
