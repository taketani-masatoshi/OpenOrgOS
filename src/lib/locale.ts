import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  displayLanguageCodeSchema,
  displayLanguageRegistrySchema,
  type DisplayLanguageCode,
  type DisplayLanguageEntry,
  type DisplayLanguageRegistry,
} from "../../schemas/locale.js";
import { loadTenantConfig, ROOT_DIR } from "./tenant.js";
import { readYamlFile } from "./utils.js";

export const LOCALE_REGISTRY_PATH = join(ROOT_DIR, "steward", "locale", "registry.yaml");

export interface ResolvedDisplayLocale {
  code: DisplayLanguageCode;
  bcp47: string;
  label: string;
}

let _localeRegistryCache: DisplayLanguageRegistry | null = null;

export function loadDisplayLanguageRegistry(): DisplayLanguageRegistry {
  if (_localeRegistryCache) return _localeRegistryCache;
  if (!existsSync(LOCALE_REGISTRY_PATH)) {
    throw new Error(`Missing display language registry: ${LOCALE_REGISTRY_PATH}`);
  }
  _localeRegistryCache = readYamlFile(LOCALE_REGISTRY_PATH, displayLanguageRegistrySchema);
  return _localeRegistryCache;
}

export function resetDisplayLanguageRegistryCache(): void {
  _localeRegistryCache = null;
}

export function resolveDisplayLanguageCode(raw: string): DisplayLanguageCode {
  const parsed = displayLanguageCodeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error(
    `Unknown display_language "${raw}" — see steward/locale/registry.yaml (${displayLanguageCodeSchema.options.join(" | ")})`
  );
}

export function getDisplayLanguageEntry(code: DisplayLanguageCode): DisplayLanguageEntry {
  const entry = loadDisplayLanguageRegistry().languages[code];
  if (!entry) throw new Error(`Display language not defined: ${code}`);
  return entry;
}

export function listDisplayLanguageCodes(): DisplayLanguageCode[] {
  return Object.keys(loadDisplayLanguageRegistry().languages) as DisplayLanguageCode[];
}

function bcp47ToDisplayLanguage(bcp47: string): DisplayLanguageCode | null {
  const registry = loadDisplayLanguageRegistry();
  for (const [code, entry] of Object.entries(registry.languages)) {
    if (entry.bcp47 === bcp47) return code as DisplayLanguageCode;
  }
  if (bcp47.startsWith("ja")) return "ja";
  if (bcp47.startsWith("en")) return "en";
  if (bcp47.startsWith("zh-Hant") || bcp47.startsWith("zh-HK")) return "zh-Hant";
  if (bcp47.startsWith("zh")) return "zh-Hans";
  if (bcp47.startsWith("et")) return "et";
  return null;
}

/**
 * Display language — independent from legal jurisdiction pack.
 * Priority: STEWARD_DISPLAY_LANGUAGE → display_language → locale (legacy) → pack default
 */
export function getResolvedDisplayLocale(fallbackPackLocale?: string): ResolvedDisplayLocale {
  const config = loadTenantConfig();

  let code: DisplayLanguageCode | null = null;

  const fromEnv = process.env.STEWARD_DISPLAY_LANGUAGE?.trim();
  if (fromEnv) {
    code = resolveDisplayLanguageCode(fromEnv);
  }

  if (!code && config.display_language) {
    code = resolveDisplayLanguageCode(config.display_language);
  }

  if (!code && config.locale) {
    code = bcp47ToDisplayLanguage(config.locale);
  }

  if (!code && fallbackPackLocale) {
    code = bcp47ToDisplayLanguage(fallbackPackLocale);
  }

  if (!code) {
    code = "ja";
  }

  const entry = getDisplayLanguageEntry(code);
  const labelKey: "ja" | "en" = code === "en" ? "en" : "ja";
  const label = entry.label[labelKey] ?? entry.label.en;

  const bcp47 =
    !fromEnv && !config.display_language && config.locale
      ? config.locale
      : entry.bcp47;

  return { code, bcp47, label };
}
