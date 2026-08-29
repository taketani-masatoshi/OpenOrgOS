import { z } from "zod";

export const ledgerPlanIdSchema = z.enum(["starter", "business", "accountant"]);

export const ledgerSignupStatusSchema = z.enum([
  "pending",
  "checkout",
  "paid",
  "provisioned",
  "cancelled",
]);

export const ledgerSignupSchema = z.object({
  signup_id: z.string().min(1),
  tenant_id: z.string().min(1),
  company_name: z.string().min(1),
  admin_email: z.string().email(),
  plan: ledgerPlanIdSchema,
  status: ledgerSignupStatusSchema,
  created_at: z.string(),
  stripe_checkout_session_id: z.string().optional(),
  stripe_customer_id: z.string().optional(),
});

export const ledgerSignupsFileSchema = z.object({
  version: z.literal(1),
  signups: z.array(ledgerSignupSchema),
});

export const ledgerSubscriptionStatusSchema = z.enum([
  "trialing",
  "active",
  "past_due",
  "cancelled",
]);

export const ledgerSubscriptionSchema = z.object({
  version: z.literal(1),
  plan: ledgerPlanIdSchema,
  status: ledgerSubscriptionStatusSchema,
  company_name: z.string().optional(),
  admin_email: z.string().email().optional(),
  stripe_customer_id: z.string().optional(),
  stripe_subscription_id: z.string().optional(),
  trial_ends_at: z.string().optional(),
  current_period_end: z.string().optional(),
  updated_at: z.string(),
});

export type LedgerPlanId = z.infer<typeof ledgerPlanIdSchema>;
export type LedgerSignup = z.infer<typeof ledgerSignupSchema>;
export type LedgerSignupStatus = z.infer<typeof ledgerSignupStatusSchema>;
export type LedgerSubscription = z.infer<typeof ledgerSubscriptionSchema>;
export type LedgerSubscriptionStatus = z.infer<typeof ledgerSubscriptionStatusSchema>;
