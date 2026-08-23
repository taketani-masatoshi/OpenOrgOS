import { z } from "zod";

export const regulationBindingModeSchema = z.enum([
  /** Doctor warns; mutations not blocked. */
  "advisory",
  /** Dangerous mutations DENY on drift. */
  "enforced",
]);

export const regulationBindingExpectedSchema = z.object({
  regulation_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  implementation_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export const regulationBindingEntrySchema = z.object({
  binding_id: z.string().regex(/^BIND-[A-Z0-9-]+$/),
  regulation_ref: z.object({
    reg_id: z.string().min(1),
    clause: z.string().min(1).optional(),
    /** Repo-relative or tenant-relative path to regulation artifact. */
    artifact_path: z.string().min(1),
  }),
  implementation: z.object({
    /** Tenant-relative path under tenants/{id}/ (e.g. data/org/operators.yaml). */
    path: z.string().min(1),
    /**
     * Registered canonical subset id (deterministic extractor).
     * Omit = hash entire normalized file.
     */
    canonical_subset_id: z.string().min(1).optional(),
  }),
  /** Fingerprints fixed at board enactment / freeze. */
  expected: regulationBindingExpectedSchema.optional(),
  notes: z.string().optional(),
});

export const regulationBindingsManifestSchema = z.object({
  version: z.literal(1),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: regulationBindingModeSchema.default("advisory"),
  /** Company event that enacted this fingerprint set (EVT-...). */
  enacting_event_id: z.string().optional(),
  /** sha256 of sorted bindings without expected (structure identity). */
  map_structure_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  /** H(map ‖ all expected ‖ enacting_event_id). */
  set_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  bindings: z.array(regulationBindingEntrySchema).default([]),
  notes: z.string().optional(),
});

export type RegulationBindingMode = z.output<typeof regulationBindingModeSchema>;
export type RegulationBindingEntry = z.output<typeof regulationBindingEntrySchema>;
export type RegulationBindingsManifest = z.output<typeof regulationBindingsManifestSchema>;
