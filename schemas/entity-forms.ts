import { z } from "zod";

export const entityFormEntrySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  name_en: z.string().optional(),
  name_ja: z.string().optional(),
  liability: z.enum(["limited", "unlimited", "mixed", "none"]).optional(),
  governance: z.record(z.string(), z.unknown()).optional(),
  identifiers: z.array(z.string()).optional(),
  status: z.enum(["active", "stub", "legacy", "planned"]).default("active"),
  notes: z.string().optional(),
});

export const entityFormsFileSchema = z.object({
  jurisdiction: z.string().optional(),
  legal_subdivision: z.string().optional(),
  forms: z.array(entityFormEntrySchema).min(1),
});

export type EntityFormEntry = z.output<typeof entityFormEntrySchema>;
export type EntityFormsFile = z.output<typeof entityFormsFileSchema>;
