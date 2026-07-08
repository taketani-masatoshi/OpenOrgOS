import { z } from "zod";

export const orgRefSchema = z.object({
  org_id: z.string().min(1),
  org_uri: z.string().optional(),
});

export const identityRefSchema = z.object({
  org_ref: orgRefSchema,
  document_version: z.string().optional(),
});

export const delegationRefSchema = z.object({
  grant_id: z.string(),
  proof_ref: z.string().optional(),
});

export const coreEventTypeSchema = z.enum([
  "org.identity.presented",
  "org.authority.delegated",
  "org.transaction.recorded",
  "org.audit.attested",
  "org.witness.attestation.registered",
  "org.witness.receipt.issued",
]);

export const orgEventSchema = z.object({
  type: z.union([coreEventTypeSchema, z.string()]),
  payload: z.record(z.unknown()),
});

export const eventEnvelopeSchema = z.object({
  protocol_version: z.literal("1"),
  event_id: z.string().uuid(),
  occurred_at: z.string().min(1),
  origin: orgRefSchema,
  destination: orgRefSchema.optional(),
  causation_id: z.string().optional(),
  correlation_id: z.string().optional(),
  identity: identityRefSchema,
  delegation: delegationRefSchema.optional(),
  event: orgEventSchema,
  signature: z.string().nullable().optional(),
});

export type OrgRef = z.output<typeof orgRefSchema>;
export type IdentityRef = z.output<typeof identityRefSchema>;
export type DelegationRef = z.output<typeof delegationRefSchema>;
export type CoreEventType = z.output<typeof coreEventTypeSchema>;
export type OrgEvent = z.output<typeof orgEventSchema>;
export type EventEnvelope = z.output<typeof eventEnvelopeSchema>;
