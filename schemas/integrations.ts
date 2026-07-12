import { z } from "zod";

export const integrationWebhookSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  secret: z.string().optional(),
  notes: z.string().optional(),
});

export const integrationsSetupSchema = z.object({
  completed_at: z.string().nullish(),
  completed_by: z.string().nullish(),
  version: z.string().optional(),
});

export const integrationsFileSchema = z.object({
  version: z.literal("1"),
  setup: integrationsSetupSchema.optional(),
  webhooks: z.array(integrationWebhookSchema).default([]),
  notes: z.string().optional(),
});

export type IntegrationsFile = z.output<typeof integrationsFileSchema>;
export type IntegrationWebhook = z.output<typeof integrationWebhookSchema>;

/** Non-interactive wizard input (CI / tests). */
export const tenantSetupAnswersSchema = z.object({
  skip_executive: z.boolean().optional(),
  skip_operators: z.boolean().optional(),
  mail_provider: z.enum(["gmail_compose", "smtp", "dry_run"]).default("dry_run"),
  from_name: z.string().min(1).optional(),
  from_email: z.string().email().optional(),
  smtp_host: z.string().optional(),
  smtp_port: z.number().int().positive().optional(),
  smtp_secure: z.boolean().optional(),
  smtp_user: z.string().optional(),
  smtp_password: z.string().optional(),
  slack_webhook_url: z.string().url().optional(),
  webhook_url: z.string().url().optional(),
  webhook_secret: z.string().optional(),
  operator_id: z.string().optional(),
});

export type TenantSetupAnswers = z.output<typeof tenantSetupAnswersSchema>;
