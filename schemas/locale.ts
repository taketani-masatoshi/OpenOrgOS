import { z } from "zod";

export const displayLanguageCodeSchema = z.enum(["ja", "en", "zh-Hant", "zh-Hans", "et", "ms", "ar", "ru", "de"]);

export const displayLanguageEntrySchema = z.object({
  bcp47: z.string(),
  label: z.object({
    ja: z.string(),
    en: z.string(),
  }),
  notes: z.string().optional(),
});

export const displayLanguageRegistrySchema = z.object({
  languages: z.record(displayLanguageCodeSchema, displayLanguageEntrySchema),
});

export type DisplayLanguageCode = z.output<typeof displayLanguageCodeSchema>;
export type DisplayLanguageEntry = z.output<typeof displayLanguageEntrySchema>;
export type DisplayLanguageRegistry = z.output<typeof displayLanguageRegistrySchema>;
