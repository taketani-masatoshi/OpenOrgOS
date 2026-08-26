import { z } from "zod";
import { dateString } from "../common.js";

export const disclosureCategorySchema = z.enum([
  "statutory",
  "voluntary",
  "investor_meeting",
  "earnings",
  "governance",
  "other",
]);

export const disclosureStatusSchema = z.enum([
  "planned",
  "in_preparation",
  "pending_approval",
  "published",
  "not_applicable",
]);

export const disclosureCalendarItemSchema = z.object({
  id: z.string().regex(/^DISC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  label: z.string().min(1),
  category: disclosureCategorySchema,
  due_date: dateString,
  status: disclosureStatusSchema.default("planned"),
  material_ref: z.string().optional(),
  approval_id: z
    .string()
    .regex(/^APR-\d{8}-\d{3,}$/)
    .optional(),
  company_event_id: z.string().optional(),
  notes: z.string().optional(),
});

export const disclosureCalendarFileSchema = z.object({
  version: z.literal(1).default(1),
  fiscal_year: z.string().optional(),
  items: z.array(disclosureCalendarItemSchema).default([]),
  notes: z.string().optional(),
});

export type DisclosureCalendarItem = z.output<typeof disclosureCalendarItemSchema>;
export type DisclosureCalendarFile = z.output<typeof disclosureCalendarFileSchema>;
