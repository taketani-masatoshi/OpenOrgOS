import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const subcontractEntityType = z.enum(["corporation", "individual"]);

/** 法第2条第1項〜第6項の取引類型（政令指定の情報成果物・役務を区別）· 建設工事の下請負は除外類型 */
export const subcontractCategory = z.enum([
  "manufacturing",
  "repair",
  "information_product_program",
  "information_product_other",
  "service_transport",
  "service_warehousing",
  "service_information_processing",
  "service_other",
  "specific_transport",
  "construction_subcontract",
]);

export const subcontractDisclosureMethod = z.enum(["paper", "electronic"]);

export const subcontractPaymentMethod = z.enum([
  "bank_transfer",
  "cash",
  "promissory_note",
  "electronic_record",
  "factoring",
]);

export const subcontractAmountChangeCause = z.enum([
  "supplier_fault",
  "principal_request",
  "agreed_discount",
  "other",
]);

export const subcontractEventKind = z.enum([
  "receipt_refusal",
  "below_market_price",
  "forced_purchase",
  "retaliation",
  "benefit_request",
  "spec_change_or_redo",
  "price_negotiation_requested",
  "price_negotiation_declined",
]);

const partySizeFields = {
  entity_type: subcontractEntityType,
  capital_yen: z.number().int().nonnegative().optional(),
  regular_employees: z.number().int().nonnegative().optional(),
  as_of: isoDate,
  notes: z.string().optional(),
};

export const subcontractSettingsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  principal: z.object(partySizeFields),
});

export const subcontractPartiesFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  parties: z.array(z.object({ vendor_id: z.string().min(1), ...partySizeFields })).default([]),
});

const amountChangeSchema = z.object({
  changed_on: isoDate,
  delta_yen: z.number().int(),
  reason: z.string().min(1),
  cause: subcontractAmountChangeCause,
  refunded_on: isoDate.optional(),
});

const returnSchema = z.object({
  returned_on: isoDate,
  reason: z.string().min(1),
  supplier_fault: z.boolean(),
});

const paidMaterialSchema = z.object({
  settled_on: isoDate,
  amount_yen: z.number().int().positive(),
  notes: z.string().optional(),
});

const transactionEventSchema = z.object({
  on: isoDate,
  kind: subcontractEventKind,
  note: z.string().optional(),
});

export const subcontractTransactionSchema = z.object({
  id: z.string().min(1),
  vendor_id: z.string().min(1),
  category: subcontractCategory,
  description: z.string().optional(),
  ordered_on: isoDate,
  terms_disclosed_on: isoDate.optional(),
  disclosure_method: subcontractDisclosureMethod.optional(),
  paper_copy_requested_on: isoDate.optional(),
  paper_copy_delivered_on: isoDate.optional(),
  received_on: isoDate.optional(),
  payment_due_on: isoDate.optional(),
  paid_on: isoDate.optional(),
  payment_method: subcontractPaymentMethod.default("bank_transfer"),
  instrument_maturity_on: isoDate.optional(),
  supplier_bears_instrument_fees: z.boolean().default(false),
  amount_yen: z.number().int().positive(),
  amount_changes: z.array(amountChangeSchema).default([]),
  returns: z.array(returnSchema).default([]),
  paid_materials: z.array(paidMaterialSchema).default([]),
  events: z.array(transactionEventSchema).default([]),
  records_completed_on: isoDate.optional(),
  records_retained_until: isoDate.optional(),
  notes: z.string().optional(),
});

export const subcontractTransactionsFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  transactions: z.array(subcontractTransactionSchema).default([]),
});

export const subcontractSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      url: z.string().url(),
      type: z.enum(["law", "cabinet_order", "regulation", "guideline", "guide", "faq"]),
      retrieved_on: isoDate,
      notes: z.string().optional(),
    })
  ),
});

export type SubcontractEntityType = z.output<typeof subcontractEntityType>;
export type SubcontractCategory = z.output<typeof subcontractCategory>;
export type SubcontractPaymentMethod = z.output<typeof subcontractPaymentMethod>;
export type SubcontractEventKind = z.output<typeof subcontractEventKind>;
export type SubcontractSettingsFile = z.output<typeof subcontractSettingsFileSchema>;
export type SubcontractPrincipal = SubcontractSettingsFile["principal"];
export type SubcontractPartiesFile = z.output<typeof subcontractPartiesFileSchema>;
export type SubcontractParty = SubcontractPartiesFile["parties"][number];
export type SubcontractTransaction = z.output<typeof subcontractTransactionSchema>;
export type SubcontractTransactionsFile = z.output<typeof subcontractTransactionsFileSchema>;
export type SubcontractAmountChange = z.output<typeof amountChangeSchema>;
export type SubcontractSourcesFile = z.output<typeof subcontractSourcesFileSchema>;
