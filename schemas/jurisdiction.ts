import { z } from "zod";
import { displayLanguageCodeSchema } from "./locale.js";

/** ISO 3166-1 alpha-2 — ccTLD 相当の法域コード */
export const jurisdictionCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "Jurisdiction code must be ISO 3166-1 alpha-2");

/** 法域ごとに entity-forms.yaml で定義 — グローバル enum は持たない */
export const entityFormIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const taxProfileSchemaKindSchema = z.enum(["jp", "us", "corporate"]);

export const packTierSchema = z.enum(["full", "stub"]);

export const countryRegistryEntrySchema = z.object({
  name: z.string(),
  name_ja: z.string().optional(),
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  tier: packTierSchema,
  pack_root: z.string().optional(),
});

export const countriesRegistrySchema = z.object({
  version: z.number().int().positive(),
  description: z.string().optional(),
  countries: z.record(jurisdictionCodeSchema, countryRegistryEntrySchema),
});

export const packOwnerSchema = z.object({
  org: z.string(),
  maintainers: z.array(z.string()).optional(),
});

/** Pack root 内の正本 — OSS リポジトリ単位で独立配布 */
export const jurisdictionPackManifestSchema = z.object({
  id: jurisdictionCodeSchema,
  version: z.string(),
  contract_version: z.number().int().positive(),
  owner: packOwnerSchema,
  repository: z.string().url().optional(),
  license: z.string().optional(),
  name: z.string(),
  tier: packTierSchema.optional(),
  default_entity_form: entityFormIdSchema,
  default_currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.string(),
  default_display_language: displayLanguageCodeSchema.optional(),
  default_legal_subdivision: z.string().optional(),
  legal_system: z
    .object({
      ja: z.string(),
      en: z.string(),
    })
    .optional(),
  /** pack root 相対 */
  regulations_catalog: z.string(),
  regulations_templates_dir: z.string(),
  tax_profile_schema: taxProfileSchemaKindSchema,
  corporate_core: z.object({
    officer_comp: z.string(),
    board: z.string(),
    shareholder: z.string(),
    approval: z.string(),
    expense: z.string(),
    conflict: z.string(),
    document: z.string(),
    travel: z.string(),
  }),
  notes: z.string().optional(),
  declaration_modules: z.array(z.string()).optional(),
});

export const jurisdictionRegistryIndexEntrySchema = z.object({
  pack_root: z.string(),
});

export const jurisdictionRegistrySchema = z.object({
  packs: z.record(jurisdictionCodeSchema, jurisdictionRegistryIndexEntrySchema),
});

export const jurisdictionPacksLockEntrySchema = z.object({
  version: z.string(),
  source: z.string(),
  pack_root: z.string(),
});

export const jurisdictionPacksLockSchema = z.object({
  version: z.number().int().positive(),
  packs: z.record(jurisdictionCodeSchema, jurisdictionPacksLockEntrySchema),
});

/** Runtime 解決後 — repo 相対の絶対パスを含む */
export const jurisdictionPackEntrySchema = jurisdictionPackManifestSchema.extend({
  pack_root: z.string(),
  tier: packTierSchema,
  regulations_catalog: z.string(),
  regulations_templates_dir: z.string(),
});

export const tenantJurisdictionOverrideSchema = z.object({
  pack: jurisdictionCodeSchema,
});

export type JurisdictionCode = z.output<typeof jurisdictionCodeSchema>;
export type EntityFormId = z.output<typeof entityFormIdSchema>;
export type PackTier = z.output<typeof packTierSchema>;
export type CountryRegistryEntry = z.output<typeof countryRegistryEntrySchema>;
export type CountriesRegistry = z.output<typeof countriesRegistrySchema>;
export type JurisdictionPackManifest = z.output<typeof jurisdictionPackManifestSchema>;
export type JurisdictionPackEntry = z.output<typeof jurisdictionPackEntrySchema>;
export type JurisdictionRegistry = z.output<typeof jurisdictionRegistrySchema>;
export type JurisdictionPacksLock = z.output<typeof jurisdictionPacksLockSchema>;

export type CorporateCoreRegKey = keyof JurisdictionPackManifest["corporate_core"];

export const PACK_MANIFEST_FILE = "pack.manifest.yaml";
export const STUB_PACK_CODE = "ZZ";
