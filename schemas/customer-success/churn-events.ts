import { z } from "zod";
import { dateString } from "../common.js";

export const customerChurnEventTypeSchema = z.enum([
  "at_risk_flagged",
  "save_attempt",
  "renewed",
  "downgraded",
  "churned",
]);

export const customerChurnEventSchema = z.object({
  id: z.string().regex(/^CSE-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  event: customerChurnEventTypeSchema,
  occurred_on: dateString,
  reason_code: z.string().min(1),
  mrr_delta_man: z.number().optional(),
});

export type CustomerChurnEvent = z.output<typeof customerChurnEventSchema>;

export const customerChurnEventsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  events: z.array(customerChurnEventSchema),
});

export type CustomerChurnEventsFile = z.output<typeof customerChurnEventsFileSchema>;
