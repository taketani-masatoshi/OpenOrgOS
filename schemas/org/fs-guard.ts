import { z } from "zod";

/** Agent filesystem grant — distinct from human operator `GRN-*` access grants. */
export const fsGuardOpSchema = z.enum(["read", "write"]);

export const fsGuardGrantStatusSchema = z.enum(["active", "revoked", "expired"]);

export const fsGuardGrantIdSchema = z.string().regex(/^AGRNT-\d{8}-\d{3}$/);

export const fsGuardGrantSchema = z.object({
  grant_id: fsGuardGrantIdSchema,
  agent_id: z.string().min(1),
  key_id: z.string().min(8),
  op: fsGuardOpSchema,
  path_pattern: z.string().min(1),
  issued_at: z.string().min(1),
  expires_at: z.string().min(1).optional(),
  revoked_at: z.string().min(1).optional(),
  status: fsGuardGrantStatusSchema.default("active"),
});

export const fsGuardEventTypeSchema = z.enum(["agent.grant.issued", "agent.grant.revoked"]);

export const fsGuardEventPayloadSchema = z.object({
  grant_id: fsGuardGrantIdSchema,
  agent_id: z.string().min(1),
  key_id: z.string().min(8),
  op: fsGuardOpSchema,
  path_pattern: z.string().min(1),
  expires_at: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export const fsGuardEventSchema = z.object({
  event_id: z.string().min(1),
  type: fsGuardEventTypeSchema,
  occurred_at: z.string().min(1),
  issued_by: z.string().min(1),
  payload: fsGuardEventPayloadSchema,
  signature: z.string().min(1),
});

export const fsGuardAgentIdentitySchema = z.object({
  agent_id: z.string().min(1),
  public_key: z.string().min(1),
  key_id: z.string().min(8),
  created_at: z.string().min(1),
  status: z.enum(["active", "revoked"]).default("active"),
});

export const fsGuardIdentitiesFileSchema = z.object({
  version: z.literal("1"),
  issuer: z.object({
    public_key: z.string().min(1),
    key_id: z.string().min(8),
    created_at: z.string().min(1),
  }),
  agents: z.array(fsGuardAgentIdentitySchema).default([]),
});

export const fsGuardGrantsFileSchema = z.object({
  version: z.literal("1"),
  derived_from_event_id: z.string().optional(),
  grants: z.array(fsGuardGrantSchema).default([]),
});

export const fsGuardWriteIntentSchema = z.object({
  agent_id: z.string().min(1),
  op: z.literal("write"),
  path: z.string().min(1),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  issued_at: z.string().min(1),
  run_id: z.string().optional(),
  signature: z.string().min(1),
});

export const fsGuardApplyRecordSchema = z.object({
  event_id: z.string().min(1),
  occurred_at: z.string().min(1),
  agent_id: z.string().min(1),
  path: z.string().min(1),
  grant_id: z.string().optional(),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  expected_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  run_id: z.string().optional(),
  signature: z.string().min(1),
});

export type FsGuardOp = z.output<typeof fsGuardOpSchema>;
export type FsGuardGrant = z.output<typeof fsGuardGrantSchema>;
export type FsGuardEvent = z.output<typeof fsGuardEventSchema>;
export type FsGuardAgentIdentity = z.output<typeof fsGuardAgentIdentitySchema>;
export type FsGuardIdentitiesFile = z.output<typeof fsGuardIdentitiesFileSchema>;
export type FsGuardGrantsFile = z.output<typeof fsGuardGrantsFileSchema>;
export type FsGuardWriteIntent = z.output<typeof fsGuardWriteIntentSchema>;
export type FsGuardApplyRecord = z.output<typeof fsGuardApplyRecordSchema>;
