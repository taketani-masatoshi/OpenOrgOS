import { z } from "zod";
import { dateString } from "../common.js";

export const customerSentimentSchema = z.enum(["positive", "neutral", "negative"]);

export const customerHealthSignalSchema = z.object({
  id: z.string().regex(/^CSS-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  observed_on: dateString,
  usage_index: z.number().min(0).max(100),
  active_users: z.number().int().nonnegative().optional(),
  open_tickets: z.number().int().nonnegative().optional(),
  escalations_90d: z.number().int().nonnegative().optional(),
  sentiment: customerSentimentSchema.optional(),
});

export type CustomerHealthSignal = z.output<typeof customerHealthSignalSchema>;

export const customerHealthSignalsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  signals: z.array(customerHealthSignalSchema),
});

export type CustomerHealthSignalsFile = z.output<typeof customerHealthSignalsFileSchema>;
