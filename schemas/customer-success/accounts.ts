import { z } from "zod";
import { dateString } from "../common.js";

export const customerHealthStatusSchema = z.enum([
  "healthy",
  "at_risk",
  "critical",
  "churned",
]);

export type CustomerHealthStatus = z.output<typeof customerHealthStatusSchema>;

export const customerLifecycleSchema = z.enum(["prospect", "customer"]);

export type CustomerLifecycle = z.output<typeof customerLifecycleSchema>;

export const customerAccountSchema = z
  .object({
    id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
    company: z.string().min(1),
    /** prospect = sales pipeline; customer = CS after-sales */
    lifecycle: customerLifecycleSchema.default("customer"),
    /** Company email domains for mail linking / dedupe (no personal webmail) */
    email_domains: z.array(z.string().min(1)).optional(),
    /** Internal owner id / role key */
    owner: z.string().min(1).optional(),
    owner_name: z.string().min(1).optional(),
    health: customerHealthStatusSchema.optional(),
    /** Date when health was last declared by operator */
    health_declared_on: dateString.optional(),
    renewal_date: dateString.optional(),
    mrr_band: z.string().min(1).optional(),
    mrr_man: z.number().nonnegative().optional(),
    last_contact_on: dateString.optional(),
    next_action: z.string().min(1).optional(),
    next_action_due: dateString.optional(),
    plan_id: z.string().min(1).optional(),
    contract_ids: z.array(z.string().regex(/^CTR-/)).optional(),
    segment: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
    tags: z.array(z.string().min(1)).optional(),
    demo: z.boolean().optional(),
  })
  .superRefine((account, ctx) => {
    const lifecycle = account.lifecycle ?? "customer";
    if (lifecycle === "customer" && !account.health) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "health is required when lifecycle is customer",
        path: ["health"],
      });
    }
  });

export type CustomerAccount = z.output<typeof customerAccountSchema>;

export const customerAccountsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  accounts: z.array(customerAccountSchema),
});

export type CustomerAccountsFile = z.output<typeof customerAccountsFileSchema>;
