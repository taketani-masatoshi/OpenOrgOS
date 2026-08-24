import { z } from "zod";
import { dateString } from "./common.js";

export const certificationTrackSchema = z.enum([
  "business_module",
  "core_capability",
  "jurisdiction_pack",
]);

export const certificationBadgeSchema = z.enum([
  "internal_catalog",
  "ooo_reviewed",
  "official",
  "certified",
  "not_ready",
]);

export const philosophyGateStatusSchema = z.enum([
  "pass",
  "fail",
  "pending_maintainer",
  "manual_required",
]);

/** Per-target evidence file (modules/{id}/certification.yaml etc.). */
export const certificationEvidenceSchema = z.object({
  track: certificationTrackSchema,
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  badge: certificationBadgeSchema,
  proposed_next_badge: certificationBadgeSchema.optional(),
  score_self: z.number().min(0).max(100).nullable().optional(),
  philosophy_gate: philosophyGateStatusSchema,
  reviewed_at: dateString.nullable().optional(),
  reviewed_by: z.string().min(1).nullable().optional(),
  next_review_by: dateString.nullable().optional(),
  revoked_at: dateString.nullable().optional(),
  revoke_reason: z.string().optional(),
  not_a_business_module: z.boolean().optional(),
  distinct_from_module: z.string().optional(),
  refs: z
    .object({
      procedure: z.string().optional(),
      scorecard: z.string().optional(),
      adr: z.string().optional(),
      overview: z.string().optional(),
    })
    .optional(),
  history: z
    .array(
      z.object({
        at: dateString,
        action: z.enum(["grant", "revoke", "renew", "note"]),
        badge: certificationBadgeSchema.optional(),
        by: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.string().optional(),
});

export const officialCertificationRegistryEntrySchema = z.object({
  track: certificationTrackSchema,
  id: z.string().min(1),
  badge: certificationBadgeSchema,
  evidence_ref: z.string().min(1),
  label: z.string().optional(),
  reviewed_at: dateString.nullable().optional(),
  reviewed_by: z.string().nullable().optional(),
  next_review_by: dateString.nullable().optional(),
  philosophy_gate: philosophyGateStatusSchema.optional(),
});

export const officialCertificationRegistrySchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  notes: z.string().optional(),
  entries: z.array(officialCertificationRegistryEntrySchema).default([]),
});

export type CertificationTrack = z.output<typeof certificationTrackSchema>;
export type CertificationBadge = z.output<typeof certificationBadgeSchema>;
export type CertificationEvidence = z.output<typeof certificationEvidenceSchema>;
export type OfficialCertificationRegistry = z.output<
  typeof officialCertificationRegistrySchema
>;
export type OfficialCertificationRegistryEntry = z.output<
  typeof officialCertificationRegistryEntrySchema
>;

/** Badges that may be described as OOO-reviewed / official surfaces. */
export const REVIEWED_BADGES: CertificationBadge[] = [
  "ooo_reviewed",
  "official",
  "certified",
];

/** Badges allowed in public “Official module” claims. */
export const OFFICIAL_CLAIM_BADGES: CertificationBadge[] = [
  "official",
  "certified",
];

/** Trust roots for signed official registry snapshots (public keys only). */
export const certificationTrustKeySchema = z.object({
  key_id: z.string().min(1),
  algorithm: z.literal("ed25519"),
  public_key_spki_b64: z.string().min(1),
  status: z.enum(["active", "revoked"]).default("active"),
  /**
   * fixture = repo test/dev only — must never authorize public Official claims.
   * production = maintainer root for oorgos.org / public Official.
   */
  trust_class: z.enum(["fixture", "production"]).default("fixture"),
  note: z.string().optional(),
});

export const certificationTrustRootsSchema = z.object({
  version: z.literal(1),
  keys: z.array(certificationTrustKeySchema).min(1),
  notes: z.string().optional(),
});

export const certificationRevocationEntrySchema = z.object({
  track: certificationTrackSchema,
  id: z.string().min(1),
  reason: z.string().min(1),
  revoked_at: dateString,
});

/**
 * Entry inside a signed snapshot. evidence_digest binds the evidence file bytes
 * so a local badge edit cannot impersonate Official without re-signing.
 */
export const signedRegistrySnapshotEntrySchema =
  officialCertificationRegistryEntrySchema.extend({
    evidence_digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  });

/**
 * Detached Ed25519 signature over canonical payload (see module-certification-trust).
 * Hosted on oorgos.org / Community as disclosure; orgos verifies before Official claims.
 */
export const signedOfficialRegistrySnapshotSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  key_id: z.string().min(1),
  /** sha256 hex of canonical unsigned body */
  payload_digest: z.string().regex(/^[a-f0-9]{64}$/),
  signature_b64: z.string().min(1),
  entries: z.array(signedRegistrySnapshotEntrySchema).default([]),
  revoked: z.array(certificationRevocationEntrySchema).default([]),
  notes: z.string().optional(),
  /** Where maintainers publish this file (informational). */
  distribution_hint: z.string().optional(),
});

export type CertificationTrustRoots = z.output<
  typeof certificationTrustRootsSchema
>;
export type SignedOfficialRegistrySnapshot = z.output<
  typeof signedOfficialRegistrySnapshotSchema
>;
export type CertificationRevocationEntry = z.output<
  typeof certificationRevocationEntrySchema
>;
