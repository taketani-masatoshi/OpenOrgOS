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

/**
 * Counterparty / account profile held in sales SoT (CRM-like).
 * Prefer bands and business contact channels; avoid personal vault fields.
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
export const salesDealSchema = z.object({
  id: z.string().regex(/^DEAL-\d{4}-\d{3}$/),
  title: z.string().min(1),
  stage: salesDealStageSchema,
  /** Internal assignee id / role key (optional when owner_name set) */
  owner: z.string().min(1).optional(),
  /** Display name — e.g. 段燕燕 · 宮城万貴子 */
  owner_name: z.string().min(1).optional(),
  /** Company short name (required if party omitted) */
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
}).superRefine((deal, ctx) => {
  if (!deal.owner && !deal.owner_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "owner or owner_name is required",
      path: ["owner_name"],
    });
  }
  if (!deal.counterparty && !deal.party?.company) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "counterparty or party.company is required",
      path: ["counterparty"],
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
