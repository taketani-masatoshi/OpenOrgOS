import { z } from "zod";
import { isoDate } from "./iso-date.js";

const yenAmount = z.number().int().nonnegative();

export const takkenLicensorKind = z.enum(["governor", "minister"]);

/** 宅地建物取引業法第4条第1項第1号〜第5号 — 第9条の変更届出の対象（`other` は要確認） */
export const takkenChangeItem = z.enum([
  "trade_name",
  "officer",
  "office",
  "dedicated_takkenshi",
  "other",
]);

export const takkenSecurityMethod = z.enum(["deposit", "guarantee_association"]);

export const takkenLicenseFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  license: z.object({
    licensor_kind: takkenLicensorKind,
    licensor_prefecture: z.string().optional(),
    license_number: z.string(),
    issued_on: isoDate,
    valid_from: isoDate.optional(),
    expires_on: isoDate,
    renewal_applied_on: isoDate.optional(),
  }),
  changes: z
    .array(
      z.object({
        id: z.string(),
        item: takkenChangeItem,
        description: z.string().optional(),
        changed_on: isoDate,
        notified_on: isoDate.optional(),
      })
    )
    .default([]),
  security: z
    .object({
      method: takkenSecurityMethod,
      provider_name: z.string().optional(),
      amount_yen: yenAmount.optional(),
      completed_on: isoDate.optional(),
      business_started_on: isoDate.optional(),
    })
    .optional(),
});

export const takkenOfficeKind = z.enum(["main", "branch"]);

export const takkenshiAssignmentSchema = z.object({
  employee_id: z.string(),
  dedicated: z.boolean().default(false),
  card_expires_on: isoDate,
});

export const takkenOfficesFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  offices: z.array(
    z.object({
      office_id: z.string(),
      name: z.string(),
      kind: takkenOfficeKind,
      prefecture: z.string(),
      staff_count: z.number().int().positive(),
      takkenshi_shortage_since: isoDate.optional(),
      takkenshi: z.array(takkenshiAssignmentSchema).default([]),
      sign_posted: z.boolean().optional(),
      fee_table_posted: z.boolean().optional(),
      ledger_kept: z.boolean().optional(),
      employee_register_kept: z.boolean().optional(),
      employee_certificates_issued: z.boolean().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const takkenTransactionKind = z.enum(["sale", "exchange", "lease"]);
export const takkenTransactionRole = z.enum(["brokerage", "agency"]);
export const takkenFeePayer = z.enum(["client", "other_party"]);

export const takkenTransactionSchema = z.object({
  id: z.string(),
  deal_id: z.string().optional(),
  office_id: z.string(),
  kind: takkenTransactionKind,
  role: takkenTransactionRole,
  residential: z.boolean().default(false),
  price_yen: yenAmount.optional(),
  exchange_counter_value_yen: yenAmount.optional(),
  monthly_rent_yen: yenAmount.optional(),
  key_money_yen: yenAmount.optional(),
  low_cost_vacant_house: z.boolean().default(false),
  long_term_vacant: z.boolean().default(false),
  mediation_contract_on: isoDate.optional(),
  special_fee_agreed_on: isoDate.optional(),
  counterparty_is_licensed_dealer: z.boolean().default(false),
  contract_on: isoDate.optional(),
  explained_35_on: isoDate.optional(),
  explained_35_by: z.string().optional(),
  delivered_37_on: isoDate.optional(),
  signed_37_by: z.string().optional(),
  fee_charged_yen: yenAmount.optional(),
  fee_from_other_party_yen: yenAmount.optional(),
  one_month_consent_from: z.array(takkenFeePayer).default([]),
  notes: z.string().optional(),
});

export const takkenTransactionsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  transactions: z.array(takkenTransactionSchema),
});

export const takkenTaxStatus = z.enum(["taxable", "exempt"]);

export const takkenSettingsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  settings: z.object({
    tax_status: takkenTaxStatus,
    self_seller_new_housing: z.boolean().default(false),
    ledger_retention_years: z.number().int().positive().optional(),
    employee_register_retention_years: z.number().int().positive().optional(),
  }),
});

export const takkenSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["law", "regulation", "cabinet_order", "notice", "guideline", "guide"]),
      retrieved_on: isoDate,
      articles: z.array(z.string()).default([]),
      notes: z.string().optional(),
    })
  ),
});

export type TakkenLicensorKind = z.output<typeof takkenLicensorKind>;
export type TakkenTaxStatus = z.output<typeof takkenTaxStatus>;
export type TakkenTransactionKind = z.output<typeof takkenTransactionKind>;
export type TakkenTransactionRole = z.output<typeof takkenTransactionRole>;
export type TakkenFeePayer = z.output<typeof takkenFeePayer>;
export type TakkenLicenseFile = z.output<typeof takkenLicenseFileSchema>;
export type TakkenLicense = TakkenLicenseFile["license"];
export type TakkenLicenseChange = TakkenLicenseFile["changes"][number];
export type TakkenSecurity = NonNullable<TakkenLicenseFile["security"]>;
export type TakkenOffice = z.output<typeof takkenOfficesFileSchema>["offices"][number];
export type TakkenshiAssignment = z.output<typeof takkenshiAssignmentSchema>;
export type TakkenTransaction = z.output<typeof takkenTransactionSchema>;
export type TakkenSettings = z.output<typeof takkenSettingsFileSchema>["settings"];
export type TakkenSource = z.output<typeof takkenSourcesFileSchema>["sources"][number];
