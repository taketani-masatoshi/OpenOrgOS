import { z } from "zod";

/** Open stages + terminal outcomes. */
export const salesDealStageSchema = z.enum([
  "lead",
  "qualify",
  "proposal",
  "negotiation",
  "won",
  "lost",
]);

export type SalesDealStage = z.output<typeof salesDealStageSchema>;

export const OPEN_SALES_STAGES = [
  "lead",
  "qualify",
  "proposal",
  "negotiation",
] as const satisfies readonly SalesDealStage[];

export const salesLostReasonSchema = z.enum([
  "price",
  "competitor",
  "no_budget",
  "no_decision",
  "timing",
  "product_fit",
  "no_response",
  "other",
]);

export type SalesLostReason = z.output<typeof salesLostReasonSchema>;

export const salesLeadClassSchema = z.enum([
  "icp_fit",
  "nurture",
  "disqualify",
  "unknown",
]);

export type SalesLeadClass = z.output<typeof salesLeadClassSchema>;

/**
 * Counterparty / account profile held in sales SoT (CRM-like).
 * Prefer bands and business contact channels; avoid personal vault fields.
 * @deprecated Use account_id + contacts.yaml after migration.
 */
export const salesPartySchema = z.object({
  company: z.string().min(1),
  contact_name: z.string().min(1).optional(),
  contact_title: z.string().min(1).optional(),
  /** Business email (not personal webmail) */
  contact_email: z.string().min(1).optional(),
  /** Company switchboard / published desk line */
  contact_phone: z.string().min(1).optional(),
  capital_band: z.string().min(1).optional(),
  /** Internal credit / risk summary */
  credit: z.string().min(1).optional(),
  /** Pref + city (not street-level personal address) */
  location: z.string().min(1).optional(),
  shareholders: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
});

export type SalesParty = z.output<typeof salesPartySchema>;

/**
 * Sales pipeline deal — SoT may be rich; Canvas projects CEO-facing slices.
 */
export const salesDealSchema = z
  .object({
    id: z.string().regex(/^DEAL-\d{4}-\d{3}$/),
    title: z.string().min(1),
    stage: salesDealStageSchema,
    /** Linked customer account (CUST-*) */
    account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/).optional(),
    contact_ids: z.array(z.string().regex(/^CONTACT-\d{4}-\d{3}$/)).optional(),
    inquiry_id: z.string().regex(/^INQ-\d{4}-\d{3}$/).optional(),
    quote_ids: z.array(z.string().regex(/^QUOTE-\d{4}-\d{3}$/)).optional(),
    scheduling_case_id: z.string().regex(/^SCH-\d{4}-\d{3}$/).optional(),
    /** RFC Message-ID thread refs (L1 pointers only) */
    mail_thread_ids: z.array(z.string().min(1)).optional(),
    /** Gmail API thread ids */
    gmail_thread_ids: z.array(z.string().min(1)).optional(),
    lost_reason: salesLostReasonSchema.optional(),
    lost_notes: z.string().min(1).optional(),
    lead_class: salesLeadClassSchema.optional(),
    /** Deterministic classification suggestion — forecast uses probability_pct only */
    confidence_pct: z.number().int().min(0).max(100).optional(),
    /** Internal assignee id / role key (optional when owner_name set) */
    owner: z.string().min(1).optional(),
    /** Display name — e.g. 段燕燕 · 宮城万貴子 */
    owner_name: z.string().min(1).optional(),
    /** Company short name (required if party omitted and account_id unset) */
    counterparty: z.string().min(1).optional(),
    party: salesPartySchema.optional(),
    amount_band: z.string().min(1).optional(),
    amount_man: z.number().nonnegative().optional(),
    probability_pct: z.number().int().min(0).max(100).optional(),
    next_action: z.string().min(1).optional(),
    next_action_due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    close_date_target: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    stage_entered_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    tags: z.array(z.string().min(1)).optional(),
    /** Explicit SoT priority for CEO boards (optional) */
    priority: z.enum(["critical", "high", "normal"]).optional(),
    demo: z.boolean().optional(),
  })
  .superRefine((deal, ctx) => {
    if (!deal.owner && !deal.owner_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "owner or owner_name is required",
        path: ["owner_name"],
      });
    }
    if (!deal.account_id && !deal.counterparty && !deal.party?.company) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "account_id, counterparty, or party.company is required",
        path: ["counterparty"],
      });
    }
    if (deal.stage === "lost" && !deal.lost_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lost_reason is required when stage is lost",
        path: ["lost_reason"],
      });
    }
    if (deal.stage === "won" && deal.amount_man == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount_man is required when stage is won",
        path: ["amount_man"],
      });
    }
  });

export type SalesDeal = z.output<typeof salesDealSchema>;

export const salesPipelineFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  deals: z.array(salesDealSchema),
});

export type SalesPipelineFile = z.output<typeof salesPipelineFileSchema>;

export function isOpenSalesDeal(deal: SalesDeal): boolean {
  return (OPEN_SALES_STAGES as readonly string[]).includes(deal.stage);
}

/** Inbound inquiry — triage queue for sales_inbound. */
export const salesInquiryStatusSchema = z.enum([
  "new",
  "triaged",
  "responded",
  "qualified",
  "closed",
]);

export type SalesInquiryStatus = z.output<typeof salesInquiryStatusSchema>;

export const salesInquirySchema = z.object({
  id: z.string().regex(/^INQ-\d{4}-\d{3}$/),
  subject: z.string().min(1),
  status: salesInquiryStatusSchema,
  source: z.string().min(1).optional(),
  company: z.string().min(1),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/).optional(),
  owner: z.string().min(1).optional(),
  owner_name: z.string().min(1).optional(),
  received_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  next_action: z.string().min(1).optional(),
  next_action_due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  priority: z.enum(["critical", "high", "normal"]).optional(),
  tags: z.array(z.string().min(1)).optional(),
  notes: z.string().min(1).optional(),
  /** L1 pointer to source channel (triage entry id, eml_ref, form id) */
  source_ref: z.string().min(1).optional(),
  mail_thread_ids: z.array(z.string().min(1)).optional(),
  gmail_thread_ids: z.array(z.string().min(1)).optional(),
  demo: z.boolean().optional(),
});

export type SalesInquiry = z.output<typeof salesInquirySchema>;

export const salesInquiriesFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  inquiries: z.array(salesInquirySchema),
});

export type SalesInquiriesFile = z.output<typeof salesInquiriesFileSchema>;

/** Outbound campaign / list — for sales_outbound. */
export const salesOutboundCampaignStatusSchema = z.enum([
  "draft",
  "active",
  "paused",
  "completed",
]);

export type SalesOutboundCampaignStatus = z.output<
  typeof salesOutboundCampaignStatusSchema
>;

export const salesOutboundCampaignSchema = z.object({
  id: z.string().regex(/^OUT-\d{4}-\d{3}$/),
  name: z.string().min(1),
  status: salesOutboundCampaignStatusSchema,
  owner: z.string().min(1).optional(),
  owner_name: z.string().min(1).optional(),
  target_count: z.number().int().nonnegative().optional(),
  contacted_count: z.number().int().nonnegative().optional(),
  next_action: z.string().min(1).optional(),
  next_action_due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  demo: z.boolean().optional(),
});

export type SalesOutboundCampaign = z.output<typeof salesOutboundCampaignSchema>;

export const salesOutboundCampaignsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  campaigns: z.array(salesOutboundCampaignSchema),
});

export type SalesOutboundCampaignsFile = z.output<
  typeof salesOutboundCampaignsFileSchema
>;

/** Sales quote — L1 monetary band; document body in docs/sales/quotes/ */
export const salesQuoteStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "rejected",
  "withdrawn",
]);

export type SalesQuoteStatus = z.output<typeof salesQuoteStatusSchema>;

export const salesQuoteSchema = z.object({
  id: z.string().regex(/^QUOTE-\d{4}-\d{3}$/),
  deal_id: z.string().regex(/^DEAL-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  status: salesQuoteStatusSchema.default("draft"),
  amount_man: z.number().nonnegative().optional(),
  amount_band: z.string().min(1).optional(),
  /** Tenant-logical path under docs/sales/quotes/ */
  doc_ref: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  owner_name: z.string().min(1).optional(),
  sent_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  notes: z.string().min(1).optional(),
  demo: z.boolean().optional(),
});

export type SalesQuote = z.output<typeof salesQuoteSchema>;

export const salesQuotesFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  quotes: z.array(salesQuoteSchema),
});

export type SalesQuotesFile = z.output<typeof salesQuotesFileSchema>;

/** ICP profile for deterministic lead classification */
export const salesIcpSchema = z.object({
  version: z.literal(1),
  preferred_tags: z.array(z.string().min(1)).default([]),
  preferred_domains: z.array(z.string().min(1)).default([]),
  capital_bands: z.array(z.string().min(1)).default([]),
  min_probability_pct: z.number().int().min(0).max(100).default(20),
  notes: z.string().min(1).optional(),
});

export type SalesIcp = z.output<typeof salesIcpSchema>;
