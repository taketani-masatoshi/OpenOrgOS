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
  "void",
]);

export const companyEventStatus = z.enum(["open", "closed", "archived", "voided"]);

export const companyEventRelatedSchema = z
  .object({
    registration_case_id: z.string().optional(),
    contract_id: z.string().optional(),
    regulation_id: z.string().optional(),
    approval_id: z.string().optional(),
    meeting_ref: z.string().optional(),
    target_event_id: z.string().optional(),
  })
  .passthrough();

export const companyEventWireBindingStatusSchema = z.enum([
  "proposed",
  "approved",
  "delivered",
]);

export const companyEventWireBindingSchema = z.object({
  notice_id: z.string().optional(),
  transaction_id: z.string().optional(),
  wire_event_id: z.string().uuid().optional(),
  peer_id: z.string().regex(/^PEER-\d{3}$/).optional(),
  status: companyEventWireBindingStatusSchema.optional(),
  void_request_notice_id: z.string().optional(),
  void_ack_wire_event_id: z.string().uuid().optional(),
  void_ack_at: z.string().optional(),
  void_ack_peer_id: z.string().regex(/^PEER-\d{3}$/).optional(),
});

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
  chain_seq: z.number().int().positive().optional(),
  target_event_id: z.string().optional(),
  void_reason: z.string().optional(),
  voided_by: z.string().optional(),
  voided_at: dateString.optional(),
  wire_binding: companyEventWireBindingSchema.optional(),
});

const companyEventsRegistryBaseSchema = z.object({
  events: z.array(companyEventSchema).default([]),
  notes: z.string().optional(),
});

export const companyEventsRegistrySchemaV1 = companyEventsRegistryBaseSchema.extend({
  schema_version: z.literal(1),
});

export const companyEventsRegistrySchemaV2 = companyEventsRegistryBaseSchema.extend({
  schema_version: z.literal(2),
});

export const companyEventsRegistrySchema = z
  .union([companyEventsRegistrySchemaV1, companyEventsRegistrySchemaV2])
  .transform((data) => ({
    ...data,
    schema_version: 2 as const,
  }));

export type CompanyEvent = z.output<typeof companyEventSchema>;
export type CompanyEventKind = z.output<typeof companyEventKind>;
export type CompanyEventsRegistry = z.output<typeof companyEventsRegistrySchemaV2>;
