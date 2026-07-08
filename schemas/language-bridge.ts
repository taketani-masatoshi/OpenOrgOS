import { z } from "zod";
import { displayLanguageCodeSchema } from "./locale.js";

/** How official records relate to user/display language when they differ. */
export const recordLanguageStrategySchema = z.enum([
  "same_as_user",
  "explicit",
  "jurisdiction_default",
]);

/** Document drafting layout when user ≠ system language. */
export const bilingualLayoutSchema = z.enum([
  "user_primary",
  "system_primary",
  "bilingual",
]);

export const documentLanguageRoleSchema = z.enum(["user", "system", "none"]);

export const documentTypePolicySchema = z.object({
  primary: documentLanguageRoleSchema,
  secondary: documentLanguageRoleSchema.optional(),
  notes: z.string().optional(),
});

export const languageBridgeConfigSchema = z.object({
  /** Official record language (minutes · resolutions · registry filings). */
  system_language: displayLanguageCodeSchema.optional(),
  /** Override user language; omit to inherit tenant display_language. */
  user_language: displayLanguageCodeSchema.optional(),
  record_strategy: recordLanguageStrategySchema.default("explicit"),
  layout: bilingualLayoutSchema.default("system_primary"),
  document_types: z
    .record(z.string(), documentTypePolicySchema)
    .optional(),
  notes: z.string().optional(),
});

export type RecordLanguageStrategy = z.output<typeof recordLanguageStrategySchema>;
export type BilingualLayout = z.output<typeof bilingualLayoutSchema>;
export type LanguageBridgeConfig = z.output<typeof languageBridgeConfigSchema>;
export type DocumentTypePolicy = z.output<typeof documentTypePolicySchema>;
