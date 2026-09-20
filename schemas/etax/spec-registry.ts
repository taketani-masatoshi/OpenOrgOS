import { z } from "zod";

export const etaxSpecFamilySchema = z.literal("ksk2");

export const etaxSpecArtifactStatusSchema = z.enum([
  "listed",
  "retrieved",
  "sha_recorded",
  "SPEC_BLOCKED",
]);

export const etaxSpecArtifactSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  specVersion: z.string().min(1),
  publishedOn: z.string().min(1),
  receptionStartsOn: z.string().min(1),
  source: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  retrievedAt: z.string().nullable(),
  listedSize: z.string().optional(),
  retrievedBytes: z.number().int().nonnegative().nullable().optional(),
  status: etaxSpecArtifactStatusSchema,
  notes: z.string().optional(),
  codeChangeRequired: z.boolean(),
});

export const etaxSpecManifestSchema = z.object({
  schema_version: z.literal(1),
  family: etaxSpecFamilySchema,
  baseline: z.object({
    label: z.string(),
    listingPublishedOn: z.string(),
    receptionStartsOn: z.string(),
    listingUrl: z.string().url(),
    hubUrl: z.string().url(),
    currentSoftUrl: z.string().url(),
    correctionNoticeUrl: z.string().url().optional(),
    termsUrl: z.string().url(),
  }),
  mix_legacy_specs: z.literal(false),
  retrieved_at_note: z.string(),
  artifacts: z.array(etaxSpecArtifactSchema),
});

export type EtaxSpecArtifact = z.output<typeof etaxSpecArtifactSchema>;
export type EtaxSpecManifest = z.output<typeof etaxSpecManifestSchema>;
