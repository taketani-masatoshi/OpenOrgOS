import { z } from "zod";
import { dateString } from "./common.js";

export const companyEventKind = z.enum([
  "governance",
  "registration",
  "contract",
  "finance",
  "compliance",
  "meeting",
  "personnel",
  "misc",
]);

export const companyEventStatus = z.enum(["open", "closed", "archived"]);

export const companyEventRelatedSchema = z
  .object({
    registration_case_id: z.string().optional(),
    contract_id: z.string().optional(),
    regulation_id: z.string().optional(),
    approval_id: z.string().optional(),
    meeting_ref: z.string().optional(),
  })
  .passthrough();

export const companyEventSchema = z.object({
  id: z
    .string()
    .regex(/^EVT-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  occurred_at: dateString,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  kind: companyEventKind,
  title: z.string().min(1),
  status: companyEventStatus.default("open"),
  event_path: z.string().min(1),
  artifact_dir: z.string().min(1),
  related: companyEventRelatedSchema.optional(),
  notes: z.string().optional(),
  created_at: dateString,
  closed_at: dateString.optional(),
});

export const companyEventsRegistrySchema = z.object({
  schema_version: z.literal(1).default(1),
  events: z.array(companyEventSchema).default([]),
  notes: z.string().optional(),
});

export type CompanyEvent = z.output<typeof companyEventSchema>;
export type CompanyEventKind = z.output<typeof companyEventKind>;
export type CompanyEventsRegistry = z.output<typeof companyEventsRegistrySchema>;
