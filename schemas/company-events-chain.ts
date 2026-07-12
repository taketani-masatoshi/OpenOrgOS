import { z } from "zod";
import {
  companyEventKind,
  companyEventStatus,
  companyEventWireBindingSchema,
} from "./company-events.js";
import { dateString } from "./common.js";

export const companyEventChainActionSchema = z.enum(["create", "void", "status", "wire"]);

/** Full create snapshot — enough to materialize YAML + MD frontmatter. */
export const companyEventChainCreatePayloadSchema = z.object({
  action: z.literal("create"),
  event_id: z.string().min(1),
  occurred_at: dateString,
  kind: companyEventKind,
  title: z.string().min(1),
  status: companyEventStatus,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  event_path: z.string().min(1),
  artifact_dir: z.string().min(1),
  created_at: dateString,
  related: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  target_event_id: z.string().optional(),
  void_reason: z.string().optional(),
});

export const companyEventChainVoidPayloadSchema = z.object({
  action: z.literal("void"),
  event_id: z.string().min(1),
  target_event_id: z.string().min(1),
  reason: z.string().min(1),
  voided_at: dateString.optional(),
});

export const companyEventChainStatusPayloadSchema = z.object({
  action: z.literal("status"),
  event_id: z.string().min(1),
  status: companyEventStatus,
  closed_at: dateString.optional(),
});

export const companyEventChainWirePayloadSchema = z.object({
  action: z.literal("wire"),
  event_id: z.string().min(1),
  wire_binding: companyEventWireBindingSchema,
});

export const companyEventChainPayloadSchema = z.discriminatedUnion("action", [
  companyEventChainCreatePayloadSchema,
  companyEventChainVoidPayloadSchema,
  companyEventChainStatusPayloadSchema,
  companyEventChainWirePayloadSchema,
]);

export const companyEventChainLinkSchema = z.object({
  seq: z.number().int().positive(),
  link_id: z.string().regex(/^CEL-\d+$/),
  action: companyEventChainActionSchema,
  event_id: z.string().min(1),
  target_event_id: z.string().optional(),
  prev_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  payload_digest: z.string().regex(/^[a-f0-9]{64}$/),
  /** Present on links written after chain-as-SSOT; legacy links may omit. */
  payload: companyEventChainPayloadSchema.optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  recorded_at: z.string().min(1),
});

export type CompanyEventChainAction = z.output<typeof companyEventChainActionSchema>;
export type CompanyEventChainLink = z.output<typeof companyEventChainLinkSchema>;
export type CompanyEventChainPayload = z.output<typeof companyEventChainPayloadSchema>;
export type CompanyEventChainCreatePayload = z.output<typeof companyEventChainCreatePayloadSchema>;
