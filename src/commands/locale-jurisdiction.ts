import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  getCountryEntry,
  getJurisdictionPack,
  getResolvedJurisdiction,
  listEntityForms,
  listJurisdictionCodes,
  listLegalSubdivisions,
  loadCountriesRegistry,
  resolveJurisdictionCode,
  JURISDICTION_PACKS_LOCK_PATH,
} from "../lib/jurisdiction.js";
import { checkModuleCatalogOnly } from "../lib/modules.js";
import { getModuleTier } from "../lib/module-readiness.js";
import { regulationsCatalogSchema } from "../../schemas/regulations-catalog.js";
import { listDisplayLanguageCodes, loadDisplayLanguageRegistry } from "../lib/locale.js";
import { getTenantId, ROOT_DIR } from "../lib/tenant.js";
import { readYamlFile } from "../lib/utils.js";
import { jurisdictionPacksLockSchema } from "../../schemas/jurisdiction.js";

function fullPackCodes(): string[] {
  return listJurisdictionCodes().filter((c) => getCountryEntry(c).tier === "full");
}

export function runLocaleList(): void {
  const registry = loadDisplayLanguageRegistry();
  console.log("Display languages (independent from legal jurisdiction):\n");
  console.log("| code | BCP 47 | label (ja) | label (en) |");
  console.log("|------|--------|------------|------------|");
  for (const code of listDisplayLanguageCodes()) {
    const e = registry.languages[code];
    if (!e) continue;
    console.log(`| ${code} | ${e.bcp47} | ${e.label.ja} | ${e.label.en} |`);
  }
  console.log("\nTenant: tenant.yaml `display_language` · env STEWARD_DISPLAY_LANGUAGE");
}

export function runLocaleShow(): void {
  const tenantId = getTenantId();
  const j = getResolvedJurisdiction();
  console.log(`Display locale — tenant=${tenantId}\n`);
  console.log(`  display_language: ${j.display.code}`);
  console.log(`  BCP 47:           ${j.display.bcp47}`);
  console.log(`\nLegal: ${j.code} · entity ${j.entityFormEntry.name} (${j.entityForm})`);
}

export function runJurisdictionCountries(all?: boolean): void {
  const reg = loadCountriesRegistry();
  const codes = listJurisdictionCodes();
  const full = codes.filter((c) => getCountryEntry(c).tier === "full");
  console.log(`Jurisdictions: ${codes.length} countries · ISO 3166-1 alpha-2 (ccTLD 相当)\n`);
  console.log(`  tier full: ${full.length} · tier stub: ${codes.length - full.length}`);
  console.log("\n| code | tier | currency | name |");
  console.log("|------|------|----------|------|");
  const show = all ? codes : full;
  for (const code of show) {
    const c = reg.countries[code]!;
    console.log(`| ${code} | ${c.tier} | ${c.default_currency} | ${c.name} |`);
  }
  if (!all) {
    console.log(`\n全 ${codes.length} 法域: npm run steward -- jurisdiction countries --all`);
  }
}

export function runJurisdictionList(): void {
  runJurisdictionCountries(false);
  console.log("\nTenant: tenant.yaml `jurisdiction` · `entity_form` · optional `legal_subdivision`");
  console.log("組織形態: `jurisdiction entity-forms JP` · `jurisdiction entity-forms US --subdivision DE`");
}

export function runJurisdictionEntityForms(codeArg: string, subdivision?: string): void {
  const code = resolveJurisdictionCode(codeArg);
  const forms = listEntityForms(code, subdivision ?? null);
  const subdivisions = listLegalSubdivisions(code);
  const scope = subdivision ? `${code} · subdivision ${subdivision}` : code;
  console.log(`Entity forms — ${scope} (${forms.length}):\n`);
  console.log("| id | name | status |");
  console.log("|----|------|--------|");
  for (const f of forms) {
    console.log(`| ${f.id} | ${f.name} | ${f.status ?? "active"} |`);
  }
  if (subdivisions.length && !subdivision) {
    console.log(`\nSubdivisions: ${subdivisions.join(", ")}`);
    console.log(`例: jurisdiction entity-forms ${code} --subdivision DE`);
  }
  console.log("\nTenant: tenant.yaml `entity_form: <id>`");
}

export function runJurisdictionShow(): void {
  const tenantId = getTenantId();
  const j = getResolvedJurisdiction();
  console.log(`Legal jurisdiction — tenant=${tenantId}\n`);
  console.log(`  pack:             ${j.code} (${j.pack.name}) v${j.pack.version} · tier ${j.packTier}`);
  console.log(`  entity_form:      ${j.entityForm} — ${j.entityFormEntry.name}`);
  if (j.entityFormEntry.status) {
    console.log(`  entity status:    ${j.entityFormEntry.status}`);
  }
  if (j.legalSubdivision) console.log(`  legal_subdivision: ${j.legalSubdivision}`);
  if (j.legalSystemLabel) console.log(`  legal system:     ${j.legalSystemLabel}`);
  console.log(`  currency:         ${j.defaultCurrency}`);
  console.log(`  regulations:      ${j.pack.regulations_catalog}`);
  console.log(`\nDisplay: ${j.display.code} · ${j.display.bcp47}`);
}

export function runJurisdictionPacksList(): void {
  if (!existsSync(JURISDICTION_PACKS_LOCK_PATH)) {
    console.log("No packs.lock.yaml");
    return;
  }
  const lock = readYamlFile(JURISDICTION_PACKS_LOCK_PATH, jurisdictionPacksLockSchema);
  console.log("Pinned packs (packs.lock.yaml):\n");
  for (const [code, entry] of Object.entries(lock.packs)) {
    console.log(`  ${code} v${entry.version} · ${entry.source} · ${entry.pack_root}`);
  }
}

export function runJurisdictionCheck(codeArg?: string): void {
  const codes = codeArg ? [resolveJurisdictionCode(codeArg)] : fullPackCodes();
  for (const code of codes) {
    const pack = getJurisdictionPack(code);
    const catalogPath = join(ROOT_DIR, pack.regulations_catalog);
    if (!existsSync(catalogPath)) {
      console.error(`✗ ${code}: missing catalog`);
      process.exit(1);
    }
    console.log(`✓ ${code} (${pack.tier}) · ${pack.regulations_catalog}`);
  }
}

export function runJurisdictionPacksCheck(codeArg?: string): void {
  const codes = codeArg ? [resolveJurisdictionCode(codeArg)] : fullPackCodes();
  let failed = false;

  for (const code of codes) {
    const pack = getJurisdictionPack(code);
    const catalogPath = join(ROOT_DIR, pack.regulations_catalog);
    if (!existsSync(catalogPath)) {
      console.error(`✗ ${code}: missing catalog`);
      failed = true;
      continue;
    }

    const catalog = readYamlFile(catalogPath, regulationsCatalogSchema);
    if (pack.tier === "stub") {
      console.log(`✓ ${code} stub · ${catalog.regulations.length} regs`);
      continue;
    }

    const templatesDir = join(ROOT_DIR, pack.regulations_templates_dir);
    let missingTemplates = 0;
    for (const reg of catalog.regulations) {
      if (!existsSync(join(templatesDir, reg.template))) missingTemplates++;
    }

    const packModules = pack.declaration_modules ?? [];
    let moduleIssues = 0;
    for (const modId of packModules) {
      moduleIssues += checkModuleCatalogOnly(modId, getModuleTier(modId)).length;
    }

    if (missingTemplates > 0 || moduleIssues > 0) {
      console.error(`✗ ${code}: templates=${missingTemplates} module_issues=${moduleIssues}`);
      failed = true;
      continue;
    }
    console.log(`✓ ${code} v${pack.version} · ${catalog.regulations.length} regs · ${packModules.length} pack modules`);
  }

  if (failed) process.exit(1);
}
