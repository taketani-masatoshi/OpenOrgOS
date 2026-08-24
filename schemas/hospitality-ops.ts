import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().min(10);

export const hospitalityChannelSchema = z.enum([
  "airbnb",
  "booking",
  "direct",
  "other",
]);

export const hospitalityStayStatusSchema = z.enum([
  "booked",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
]);

/** L1 stay / reservation meta — no guest PII */
export const hospitalityStaySchema = z.object({
  id: z.string().regex(/^STAY-\d{4}-\d{3,}$/),
  property_id: z.string().regex(/^PROP-\d{3,}$/),
  channel: hospitalityChannelSchema.default("direct"),
  status: hospitalityStayStatusSchema.default("booked"),
  check_in: isoDate,
  check_out: isoDate,
  party_size: z.number().int().positive().default(1),
  nights: z.number().int().positive().optional(),
  /** Per-night room rate before tax (JPY) — used for lodging tax */
  rate_per_night_jpy: z.number().nonnegative().optional(),
  /** OTA confirmation / listing ref (non-PII) */
  ota_ref: z.string().optional(),
  /** Path relative to tenant docs_root records — no PII in YAML */
  register_ref: z.string().optional(),
  cleaning_status: z.enum(["pending", "ordered", "done", "na"]).default("pending"),
  access_code_set: z.boolean().default(false),
  notes: z.string().optional(),
  created_at: isoDateTime.optional(),
  updated_at: isoDateTime.optional(),
});

export const hospitalityStaysFileSchema = z.object({
  version: z.literal(1).default(1),
  as_of: isoDate.optional(),
  stays: z.array(hospitalityStaySchema).default([]),
});

export const lodgingTaxBracketSchema = z.object({
  min_per_person_per_night_jpy: z.number().nonnegative(),
  max_per_person_per_night_jpy: z.number().positive().optional(),
  tax_per_person_per_night_jpy: z.number().nonnegative(),
});

export const lodgingTaxRateTableSchema = z.object({
  id: z.string().min(1),
  jurisdiction: z.string().default("JP"),
  region: z.string().min(1),
  name_ja: z.string().min(1),
  legal_basis: z.string().min(1),
  official_url: z.string().url().optional(),
  currency: z.literal("JPY").default("JPY"),
  brackets: z.array(lodgingTaxBracketSchema).min(1),
  notes: z.string().optional(),
});

export const lodgingTaxRatesFileSchema = z.object({
  version: z.literal(1).default(1),
  tables: z.array(lodgingTaxRateTableSchema).min(1),
});

export const lodgingTaxAssessmentSchema = z.object({
  id: z.string().min(1),
  stay_id: z.string(),
  property_id: z.string(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  rate_table_id: z.string(),
  taxable_per_person_per_night_jpy: z.number().nonnegative(),
  party_size: z.number().int().positive(),
  nights: z.number().int().positive(),
  tax_jpy: z.number().nonnegative(),
  computed_at: isoDateTime,
});

export const lodgingTaxPaymentSchema = z.object({
  id: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  amount_jpy: z.number().nonnegative(),
  paid_on: isoDate,
  method: z.string().optional(),
  notes: z.string().optional(),
});

/** Tokyo: file+pay by end of month after lodging month (Dec → Jan 4). */
export const lodgingTaxFilingConfigSchema = z.object({
  authority: z.string().default("東京都主税局（千代田都税事務所・宿泊税担当）"),
  portal_url: z
    .string()
    .url()
    .default("https://www.tax.metro.tokyo.lg.jp/kazei/leisure/shuk/jigyousha"),
  eltax_hint: z.string().default("電子申告は eLTAX。郵送・持参も可。"),
  how_ja: z.string().optional(),
  /** Days before due_on when Today starts showing (not same-day-only). */
  lead_days: z.array(z.number().int().positive()).default([14, 7]),
  due_rule: z.enum(["end_of_next_month_tokyo"]).default("end_of_next_month_tokyo"),
});

export const lodgingTaxPeriodFilingSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
  due_on: isoDate,
  status: z
    .enum(["open", "computed", "pack_ready", "filed", "paid", "closed"])
    .default("open"),
  pack_path: z.string().optional(),
  filed_on: isoDate.optional(),
  notes: z.string().optional(),
});

export const lodgingTaxLedgerFileSchema = z.object({
  version: z.literal(1).default(1),
  rate_table_id: z.string().default("tokyo-metropolitan"),
  filing: lodgingTaxFilingConfigSchema.default({}),
  period_filings: z.array(lodgingTaxPeriodFilingSchema).default([]),
  assessments: z.array(lodgingTaxAssessmentSchema).default([]),
  payments: z.array(lodgingTaxPaymentSchema).default([]),
});

/** Cleaning vendor report — Drive URL / path refs only (no photo bytes). */
export const cleaningLiabilitySchema = z.enum([
  "vendor",
  "host",
  "guest",
  "shared",
  "unclear",
]);

export const cleaningVendorMessageSchema = z.object({
  at: isoDateTime,
  direction: z.enum(["out", "in"]),
  summary: z.string().min(1),
});

export const cleaningReportSchema = z.object({
  id: z.string().min(1),
  stay_id: z.string(),
  property_id: z.string(),
  vendor_ref: z.string().optional(),
  drive_folder_url: z.string().optional(),
  photo_path_refs: z.array(z.string()).default([]),
  submitted_on: isoDate.optional(),
  accepted_on: isoDate.optional(),
  status: z.enum(["pending", "submitted", "accepted", "issue"]).default("pending"),
  issue_summary: z.string().optional(),
  liability: cleaningLiabilitySchema.optional(),
  resolution_notes: z.string().optional(),
  vendor_messages: z.array(cleaningVendorMessageSchema).default([]),
  updated_at: isoDateTime.optional(),
});

export const cleaningReportsFileSchema = z.object({
  version: z.literal(1).default(1),
  reports: z.array(cleaningReportSchema).default([]),
});

/** Guest / stay damage evidence for insurance — path refs only. */
export const damageIncidentSchema = z.object({
  id: z.string().min(1),
  stay_id: z.string().optional(),
  property_id: z.string(),
  item_description: z.string().min(1),
  discovered_on: isoDate,
  evidence_path_refs: z.array(z.string()).default([]),
  drive_folder_url: z.string().optional(),
  insurance_policy_ref: z.string().optional(),
  claim_status: z
    .enum(["none", "preparing", "filed", "settled", "denied"])
    .default("none"),
  liability: z.enum(["guest", "host", "shared", "unclear"]).default("unclear"),
  estimated_jpy: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  updated_at: isoDateTime.optional(),
});

export const damageIncidentsFileSchema = z.object({
  version: z.literal(1).default(1),
  incidents: z.array(damageIncidentSchema).default([]),
});

/** Recurring / periodic ops — insurance renew, fire inspect, monthly tax prep, etc. */
export const opsRecurringTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum([
    "tax",
    "compliance",
    "maintenance",
    "insurance",
    "cleaning",
    "other",
  ]),
  property_id: z.string().optional(),
  cadence: z.enum(["monthly", "quarterly", "yearly", "once"]),
  next_due: isoDate,
  /** Advance windows for Today (days before next_due). */
  lead_days: z.array(z.number().int().positive()).default([14, 7]),
  last_completed_on: isoDate.optional(),
  cli_hint: z.string().optional(),
  notes: z.string().optional(),
});

export const opsRecurringFileSchema = z.object({
  version: z.literal(1).default(1),
  tasks: z.array(opsRecurringTaskSchema).default([]),
});

/** Access codes are L2 — store under gitignore path; schema for validation only */
export const hospitalityAccessCodeEntrySchema = z.object({
  stay_id: z.string(),
  code: z.string().min(1),
  valid_from: isoDate.optional(),
  valid_to: isoDate.optional(),
  notes: z.string().optional(),
});

export const hospitalityAccessCodesFileSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(hospitalityAccessCodeEntrySchema).default([]),
});

/** ID document index — paths only, no image bytes */
export const hospitalityIdDocEntrySchema = z.object({
  id: z.string().min(1),
  stay_id: z.string(),
  doc_type: z.enum(["passport", "residence_card", "drivers_license", "other"]),
  relative_path: z.string().min(1),
  retained_until: isoDate,
  registered_on: isoDate,
  notes: z.string().optional(),
});

export const hospitalityIdDocIndexFileSchema = z.object({
  version: z.literal(1).default(1),
  entries: z.array(hospitalityIdDocEntrySchema).default([]),
});

export type HospitalityStay = z.infer<typeof hospitalityStaySchema>;
export type HospitalityStaysFile = z.infer<typeof hospitalityStaysFileSchema>;
export type LodgingTaxRatesFile = z.infer<typeof lodgingTaxRatesFileSchema>;
export type LodgingTaxLedgerFile = z.infer<typeof lodgingTaxLedgerFileSchema>;
export type LodgingTaxAssessment = z.infer<typeof lodgingTaxAssessmentSchema>;
export type LodgingTaxPeriodFiling = z.infer<typeof lodgingTaxPeriodFilingSchema>;
export type HospitalityAccessCodesFile = z.infer<typeof hospitalityAccessCodesFileSchema>;
export type HospitalityIdDocIndexFile = z.infer<typeof hospitalityIdDocIndexFileSchema>;
export type CleaningReport = z.infer<typeof cleaningReportSchema>;
export type CleaningReportsFile = z.infer<typeof cleaningReportsFileSchema>;
export type DamageIncident = z.infer<typeof damageIncidentSchema>;
export type DamageIncidentsFile = z.infer<typeof damageIncidentsFileSchema>;
export type OpsRecurringTask = z.infer<typeof opsRecurringTaskSchema>;
export type OpsRecurringFile = z.infer<typeof opsRecurringFileSchema>;
