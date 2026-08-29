import { z } from "zod";

export const isoStandardKind = z.enum([
  /** Certifiable management system standard. */
  "certifiable_ms",
  /** Guidance only — no certification scheme (ISO 37000, ISO 31000, ISO 19011). */
  "guidance",
  /** Control catalogue extending another standard's annex (ISO 27002/27017/27018). */
  "control_set",
  /** Sector extension or quantification standard, not a standalone MS. */
  "sector_extension",
]);

export const isoEncodingKind = z.enum(["control_map", "none"]);

/** available = pack exists and is loadable · coming_soon = catalogued roadmap entry only. */
export const isoStandardStatus = z.enum(["available", "coming_soon"]);

/** complete = every declared evidence file has a blank form in `templates/`. */
export const isoEvidenceForms = z.enum(["complete", "partial"]);

export const isoRoadmapTier = z.enum(["1", "2", "3", "4"]);

export const isoCatalogEntrySchema = z.object({
  id: z.string().regex(/^ISO-\d{4,5}$/),
  title: z.string().min(1),
  year: z.string().min(4),
  kind: isoStandardKind,
  encoding: isoEncodingKind.default("control_map"),
  status: isoStandardStatus.default("available"),
  /**
   * Whether the pack ships a blank form for every evidence file it demands.
   * `partial` means enabling the standard raises findings the tenant cannot
   * clear without authoring the records itself.
   */
  evidence_forms: isoEvidenceForms.default("partial"),
  /** True when clauses 4-10 follow the ISO Harmonized Structure (Annex SL). */
  hls: z.boolean().default(false),
  /** Core binding profile used by `orgos iso scaffold`. */
  core_profile: z.string().optional(),
  /** Standard this one extends (control sets and sector extensions). */
  extends: z.string().optional(),
  /** True when the standard carries its own annex control catalogue / SoA. */
  annex: z.boolean().default(false),
  tier: isoRoadmapTier.optional(),
  relevance: z.string().optional(),
  notes: z.string().optional(),
});

export const isoCatalogFileSchema = z.object({
  version: z.string().default("1"),
  standards: z.array(isoCatalogEntrySchema).min(1),
});

export type IsoStandardKind = z.output<typeof isoStandardKind>;
export type IsoStandardStatus = z.output<typeof isoStandardStatus>;
export type IsoRoadmapTier = z.output<typeof isoRoadmapTier>;
export type IsoCatalogEntry = z.output<typeof isoCatalogEntrySchema>;
export type IsoCatalogFile = z.output<typeof isoCatalogFileSchema>;
