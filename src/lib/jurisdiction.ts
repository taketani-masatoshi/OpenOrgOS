import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { entityFormsFileSchema, type EntityFormEntry } from "../../schemas/entity-forms.js";
import {
  jurisdictionPackManifestSchema,
  jurisdictionPacksLockSchema,
  countriesRegistrySchema,
  PACK_MANIFEST_FILE,
  type CorporateCoreRegKey,
  type EntityFormId,
  type JurisdictionCode,
  type JurisdictionPackEntry,
  type CountryRegistryEntry,
  type CountriesRegistry,
  type PackTier,
} from "../../schemas/jurisdiction.js";
import { getInstallRoot } from "./orgos-paths.js";
import { JURISDICTIONS_DIR } from "./steward-paths.js";
import { getResolvedDisplayLocale } from "./locale.js";
import { loadTenantConfig, getTenantDir, getTenantId } from "./tenant.js";
import { readYamlFile, readYamlFileRaw } from "./utils.js";

export { JURISDICTIONS_DIR, JURISDICTION_PACKS_DIR } from "./steward-paths.js";
export type { JurisdictionCode } from "../../schemas/jurisdiction.js";
export const STUB_PACK_ROOT_REL = "steward/jurisdiction-packs/_stub";
export const COUNTRIES_REGISTRY_PATH = join(JURISDICTIONS_DIR, "countries.yaml");
export const JURISDICTION_REGISTRY_PATH = join(JURISDICTIONS_DIR, "registry.yaml");
export const JURISDICTION_PACKS_LOCK_PATH = join(JURISDICTIONS_DIR, "packs.lock.yaml");

export interface ResolvedJurisdiction {
  code: JurisdictionCode;
  pack: JurisdictionPackEntry;
  entityForm: EntityFormId;
  entityFormEntry: EntityFormEntry;
  locale: string;
  defaultCurrency: string;
  legalSubdivision: string | null;
  legalSystemLabel: string | null;
  display: ReturnType<typeof getResolvedDisplayLocale>;
  packTier: PackTier;
}

let _countriesCache: CountriesRegistry | null = null;
const _packCache = new Map<JurisdictionCode, JurisdictionPackEntry>();

export function resetJurisdictionRegistryCache(): void {
  _countriesCache = null;
  _packCache.clear();
}

function repoRelative(absPath: string): string {
  return relative(getInstallRoot(), absPath).replace(/\\/g, "/");
}

export function loadCountriesRegistry(): CountriesRegistry {
  if (_countriesCache) return _countriesCache;
  if (!existsSync(COUNTRIES_REGISTRY_PATH)) {
    throw new Error(`Missing countries registry: ${COUNTRIES_REGISTRY_PATH}`);
  }
  _countriesCache = readYamlFile(COUNTRIES_REGISTRY_PATH, countriesRegistrySchema);
  return _countriesCache;
}

export function getCountryEntry(code: JurisdictionCode): CountryRegistryEntry {
  const entry = loadCountriesRegistry().countries[code];
  if (!entry) {
    throw new Error(`Unknown jurisdiction "${code}" — see steward/jurisdictions/countries.yaml`);
  }
  return entry;
}

export function listJurisdictionCodes(): JurisdictionCode[] {
  return Object.keys(loadCountriesRegistry().countries).sort() as JurisdictionCode[];
}

function resolvePackRootRel(code: JurisdictionCode): string {
  const country = getCountryEntry(code);
  if (country.pack_root) return country.pack_root;
  if (existsSync(JURISDICTION_PACKS_LOCK_PATH)) {
    const lock = readYamlFile(JURISDICTION_PACKS_LOCK_PATH, jurisdictionPacksLockSchema);
    const entry = lock.packs[code];
    if (entry?.pack_root) return entry.pack_root;
  }
  return STUB_PACK_ROOT_REL;
}

function loadPackEntry(code: JurisdictionCode): JurisdictionPackEntry {
  const cached = _packCache.get(code);
  if (cached) return cached;

  const country = getCountryEntry(code);
  const packRootRel = resolvePackRootRel(code);
  const packRootAbs = join(getInstallRoot(), packRootRel);
  const isStub = country.tier === "stub" && packRootRel === STUB_PACK_ROOT_REL;

  const manifestPath = join(packRootAbs, PACK_MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing pack manifest: ${manifestPath}`);
  }

  const rawManifest = readYamlFile(manifestPath, jurisdictionPackManifestSchema);
  const manifest = isStub
    ? {
        ...rawManifest,
        id: code,
        name: country.name,
        default_currency: country.default_currency,
        tier: "stub" as const,
      }
    : { ...rawManifest, tier: country.tier };

  if (!isStub && manifest.id !== code) {
    throw new Error(`Pack manifest id "${manifest.id}" does not match code "${code}"`);
  }

  const entry: JurisdictionPackEntry = {
    ...manifest,
    pack_root: packRootRel,
    tier: country.tier,
    regulations_catalog: repoRelative(join(packRootAbs, manifest.regulations_catalog)),
    regulations_templates_dir: repoRelative(join(packRootAbs, manifest.regulations_templates_dir)),
  };
  _packCache.set(code, entry);
  return entry;
}

/** @deprecated Prefer loadCountriesRegistry */
export function loadJurisdictionRegistry() {
  return {
    packs: Object.fromEntries(
      listJurisdictionCodes().map((code) => [code, { pack_root: resolvePackRootRel(code) }])
    ),
  };
}

export function resolveJurisdictionCode(raw: string): JurisdictionCode {
  const code = raw.toUpperCase() as JurisdictionCode;
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error(`Invalid jurisdiction code "${raw}" — use ISO 3166-1 alpha-2`);
  }
  getCountryEntry(code);
  return code;
}

export function getJurisdictionPack(code: JurisdictionCode): JurisdictionPackEntry {
  return loadPackEntry(code);
}

export function getJurisdictionPackRoot(code: JurisdictionCode): string {
  return join(getInstallRoot(), resolvePackRootRel(code));
}

export function loadEntityFormsFile(code: JurisdictionCode, legalSubdivision?: string | null) {
  const packRoot = getJurisdictionPackRoot(code);
  if (legalSubdivision) {
    const subPath = join(packRoot, "subdivisions", legalSubdivision, "entity-forms.yaml");
    if (existsSync(subPath)) {
      return readYamlFile(subPath, entityFormsFileSchema);
    }
  }
  const path = join(packRoot, "entity-forms.yaml");
  if (existsSync(path)) {
    return readYamlFile(path, entityFormsFileSchema);
  }
  if (getCountryEntry(code).tier === "stub") {
    return readYamlFile(
      join(getInstallRoot(), STUB_PACK_ROOT_REL, "entity-forms.yaml"),
      entityFormsFileSchema
    );
  }
  throw new Error(`Missing entity-forms.yaml for jurisdiction ${code}`);
}

export function listEntityForms(
  code: JurisdictionCode,
  legalSubdivision?: string | null
): EntityFormEntry[] {
  return loadEntityFormsFile(code, legalSubdivision).forms;
}

export function resolveEntityForm(
  code: JurisdictionCode,
  formId: EntityFormId,
  legalSubdivision?: string | null
): EntityFormEntry {
  const form = listEntityForms(code, legalSubdivision).find((f) => f.id === formId);
  if (!form) {
    const scope = legalSubdivision ? `${code} · ${legalSubdivision}` : code;
    throw new Error(
      `Unknown entity_form "${formId}" for jurisdiction ${scope} — run: steward jurisdiction entity-forms ${code}`
    );
  }
  if (form.jurisdiction_exclusive?.length && !form.jurisdiction_exclusive.includes(code)) {
    throw new Error(
      `entity_form "${formId}" is exclusive to ${form.jurisdiction_exclusive.join(", ")} — not valid for ${code}`
    );
  }
  return form;
}

export function listLegalSubdivisions(code: JurisdictionCode): string[] {
  const subdivDir = join(getJurisdictionPackRoot(code), "subdivisions");
  if (!existsSync(subdivDir)) return [];
  return readdirSync(subdivDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function getResolvedJurisdiction(): ResolvedJurisdiction {
  const config = loadTenantConfig();
  if (!config.jurisdiction) {
    throw new Error(
      `Tenant "${getTenantId()}" missing jurisdiction in tenant.yaml — set jurisdiction: ISO 3166-1 alpha-2 (e.g. JP, US)`
    );
  }
  const code = resolveJurisdictionCode(config.jurisdiction);
  const pack = getJurisdictionPack(code);
  const legalSubdivision = config.legal_subdivision ?? pack.default_legal_subdivision ?? null;
  const entityForm = (config.entity_form ?? pack.default_entity_form) as EntityFormId;
  const entityFormEntry = resolveEntityForm(code, entityForm, legalSubdivision);
  const display = getResolvedDisplayLocale(pack.locale);
  const labelKey = display.code === "en" ? "en" : "ja";
  const legalSystemLabel = pack.legal_system?.[labelKey] ?? pack.legal_system?.en ?? null;

  return {
    code,
    pack,
    entityForm,
    entityFormEntry,
    locale: display.bcp47,
    defaultCurrency: config.default_currency ?? pack.default_currency,
    legalSubdivision,
    legalSystemLabel,
    display,
    packTier: pack.tier,
  };
}

export function getRegulationsCatalogPath(): string {
  const { pack } = getResolvedJurisdiction();
  const path = join(getInstallRoot(), pack.regulations_catalog);
  if (!existsSync(path)) {
    throw new Error(`Regulations catalog not found for pack: ${pack.regulations_catalog}`);
  }
  return path;
}

export function getRegulationsTemplatesDir(): string {
  const { pack } = getResolvedJurisdiction();
  return join(getInstallRoot(), pack.regulations_templates_dir);
}

export function getRegulationTemplateAbsPath(templateRel: string): string {
  return join(getRegulationsTemplatesDir(), templateRel);
}

export function getRegulationTemplateRelPath(templateRel: string): string {
  const { pack } = getResolvedJurisdiction();
  return join(pack.regulations_templates_dir, templateRel);
}

export function resolveCorporateCoreReg(key: CorporateCoreRegKey): string {
  return getResolvedJurisdiction().pack.corporate_core[key];
}

export function listPackDeclarationModuleIds(code: JurisdictionCode): string[] {
  const pack = getJurisdictionPack(code);
  return pack.declaration_modules ?? [];
}

export function loadTenantJurisdictionOverride(): { pack?: JurisdictionCode } {
  const overridePath = join(getTenantDir(), "jurisdiction.yaml");
  if (!existsSync(overridePath)) return {};
  const raw = readYamlFileRaw(overridePath) as { pack?: string };
  if (raw.pack) return { pack: resolveJurisdictionCode(raw.pack) };
  return {};
}
