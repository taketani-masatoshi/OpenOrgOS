import { z } from "zod";
import { EXTERNAL_FINANCE_SOURCES } from "./external-transaction.js";
import { iso4217CurrencySchema } from "../iso4217.js";

export const externalAccountL1Schema = z.object({
  provider: z.enum(EXTERNAL_FINANCE_SOURCES),
  account_id: z.string().min(1),
  label: z.string().min(1).max(100),
  currency: iso4217CurrencySchema.optional(),
  enabled: z.boolean().default(false),
});

export const externalAccountSecretSchema = z.object({
  provider: z.enum(EXTERNAL_FINANCE_SOURCES),
  account_id: z.string().min(1),
  endpoint: z.string().url().refine((value) => value.startsWith("https://"), "HTTPS required"),
  api_token: z.string().min(1).optional(),
  oauth_access_token: z.string().min(1).optional(),
  oauth_refresh_token: z.string().min(1).optional(),
  client_id: z.string().min(1).optional(),
  client_secret: z.string().min(1).optional(),
  webhook_secret: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.api_token && !value.oauth_access_token && !value.client_secret && !value.webhook_secret) {
    ctx.addIssue({ code: "custom", message: "At least one credential is required" });
  }
});

export type ExternalAccountL1 = z.output<typeof externalAccountL1Schema>;
export type ExternalAccountSecret = z.output<typeof externalAccountSecretSchema>;
