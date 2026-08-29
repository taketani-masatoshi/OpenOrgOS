import { z } from "zod";
import { dateString } from "../common.js";

export const customerNpsResponseSchema = z.object({
  id: z.string().regex(/^NPS-\d{4}-\d{3}$/),
  account_id: z.string().regex(/^CUST-\d{4}-\d{3}$/),
  surveyed_on: dateString,
  score: z.number().int().min(0).max(10),
  campaign: z.string().min(1).optional(),
});

export type CustomerNpsResponse = z.output<typeof customerNpsResponseSchema>;

export const customerNpsFileSchema = z.object({
  version: z.literal(1),
  updated_at: z.string().min(1).optional(),
  responses: z.array(customerNpsResponseSchema),
});

export type CustomerNpsFile = z.output<typeof customerNpsFileSchema>;
