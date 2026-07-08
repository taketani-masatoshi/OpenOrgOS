#!/usr/bin/env node
/**
 * Scaffold a TJS pack from HK template (corporate_core 8 REGs).
 * Usage: node scripts/scaffold-jurisdiction-pack.mjs AU|TW
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = join(ROOT, "steward/jurisdiction-packs");

const PRESETS = {
  AU: {
    name: "Australia",
    nameJa: "オーストラリア",
    currency: "AUD",
    locale: "en-AU",
    displayLang: "en",
    entityForm: "proprietary_ltd",
    entityLabel: "Proprietary Limited (Pty Ltd)",
    entityLocal: "Proprietary Limited",
    legalEn: "Australia law",
    legalJa: "オーストラリア法",
    repo: "jurisdiction-au",
    maintainers: "au-maintainers",
    notes: "Pty Ltd skeleton · ASIC · au-demo tenant",
  },
  TW: {
    name: "Taiwan",
    nameJa: "台湾",
    currency: "TWD",
    locale: "zh-TW",
    displayLang: "zh-Hant",
    entityForm: "private_ltd",
    entityLabel: "Private Company Limited by Shares",
    entityLocal: "股份有限公司",
    legalEn: "Taiwan law",
    legalJa: "台湾法",
    repo: "jurisdiction-tw",
    maintainers: "tw-maintainers",
    notes: "Company Ltd skeleton · tw-demo tenant",
  },
  MY: {
    name: "Malaysia",
    nameJa: "マレーシア",
    currency: "MYR",
    locale: "en-MY",
    displayLang: "en",
    entityForm: "sdn_bhd",
    entityLabel: "Sendirian Berhad (Sdn Bhd)",
    entityLocal: "Sendirian Berhad",
    legalEn: "Malaysia law",
    legalJa: "マレーシア法",
    repo: "jurisdiction-my",
    maintainers: "my-maintainers",
    notes: "Sdn Bhd skeleton · my-demo tenant · ms locale registry",
  },
  CN: {
    name: "China",
    nameJa: "中国",
    currency: "CNY",
    locale: "zh-CN",
    displayLang: "zh-Hans",
    entityForm: "llc",
    entityLabel: "Limited Liability Company",
    entityLocal: "有限责任公司",
    legalEn: "China law",
    legalJa: "中国法",
    repo: "jurisdiction-cn",
    maintainers: "cn-maintainers",
    notes: "LLC skeleton · cn-demo tenant",
  },
  AE: {
    name: "United Arab Emirates",
    nameJa: "アラブ首長国連邦",
    currency: "AED",
    locale: "en-AE",
    displayLang: "en",
    entityForm: "llc",
    entityLabel: "Limited Liability Company (LLC)",
    entityLocal: "Limited Liability Company",
    legalEn: "UAE law",
    legalJa: "UAE法",
    repo: "jurisdiction-ae",
    maintainers: "ae-maintainers",
    notes: "LLC skeleton · ae-demo tenant · ar locale registry",
  },
  RU: {
    name: "Russia",
    nameJa: "ロシア",
    currency: "RUB",
    locale: "ru-RU",
    displayLang: "ru",
    entityForm: "ooo",
    entityLabel: "Obshchestvo s ogranichennoy otvetstvennostyu (OOO)",
    entityLocal: "Общество с ограниченной ответственностью",
    legalEn: "Russia law",
    legalJa: "ロシア法",
    repo: "jurisdiction-ru",
    maintainers: "ru-maintainers",
    notes: "OOO skeleton · ru-demo tenant · data residency notes",
  },
  EU: {
    name: "European Union",
    nameJa: "欧州連合",
    currency: "EUR",
    locale: "en-EU",
    displayLang: "en",
    entityForm: "se",
    entityLabel: "Societas Europaea (SE)",
    entityLocal: "Societas Europaea",
    legalEn: "EU law (meta pack · subdivisions DE FR GB)",
    legalJa: "EU法（メタ pack · 分国 DE FR GB）",
    repo: "jurisdiction-eu",
    maintainers: "eu-maintainers",
    notes: "TJS-EU Option A · eu-demo · subdivisions DE FR GB",
  },
};

function walkReplace(dir, replacers) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walkReplace(p, replacers);
      continue;
    }
    if (!/\.(md|yaml|yml|txt)$/.test(name)) continue;
    let text = readFileSync(p, "utf-8");
    for (const [from, to] of replacers) {
      text = text.split(from).join(to);
    }
    writeFileSync(p, text);
  }
}

function renameRegDirs(packDir, code) {
  const core = join(packDir, "regulations/templates/core");
  for (const name of readdirSync(core)) {
    if (name.startsWith("REG-HK-")) {
      renameSync(join(core, name), join(core, name.replace("REG-HK-", `REG-${code}-`)));
    }
  }
}

const code = process.argv[2]?.toUpperCase();
const preset = PRESETS[code];
if (!preset) {
  console.error("Usage: node scripts/scaffold-jurisdiction-pack.mjs AU|TW|MY|CN|AE|RU|EU");
  process.exit(1);
}

const src = join(PACKS, "HK");
const dest = join(PACKS, code);
if (existsSync(dest)) {
  console.error(`Already exists: ${dest}`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });
renameRegDirs(dest, code);

const replacers = [
  ["REG-HK-", `REG-${code}-`],
  ["Hong Kong SAR China", preset.name],
  ["Hong Kong", preset.name],
  ["香港法", preset.legalJa],
  ["Hong Kong law", preset.legalEn],
  ["HKD", preset.currency],
  ["en-HK", preset.locale],
  ["hk-maintainers", preset.maintainers],
  ["jurisdiction-hk", preset.repo],
  ["hk-demo", `${code.toLowerCase()}-demo`],
  ["Companies Registry · Hong Kong", `Corporate registry · ${preset.name}`],
  ["Private Company Limited by Shares", preset.entityLabel],
  ["有限公司", preset.entityLocal],
  ["id: HK", `id: ${code}`],
  ["Sample HK Limited", `Sample ${preset.name} Ltd`],
];

walkReplace(dest, replacers);

writeFileSync(
  join(dest, "pack.manifest.yaml"),
  readFileSync(join(dest, "pack.manifest.yaml"), "utf-8")
    .replace(/default_display_language: en/, `default_display_language: ${preset.displayLang}`)
    .replace(/default_entity_form: private_ltd/, `default_entity_form: ${preset.entityForm}`)
    .replace(/default_entity_form: proprietary_ltd/, `default_entity_form: ${preset.entityForm}`)
);

writeFileSync(
  join(dest, "entity-forms.yaml"),
  `forms:
  - id: ${preset.entityForm}
    name: ${preset.entityLabel}
    name_local: ${preset.entityLocal}
    liability: limited
    governance:
      supreme_body: General Meeting
      board: Board of Directors
    identifiers:
      - company_number
    notes: Corporate registry · ${preset.name}
`
);

writeFileSync(
  join(dest, "pack.manifest.yaml"),
  readFileSync(join(dest, "pack.manifest.yaml"), "utf-8").replace(
    /notes: .*/,
    `notes: ${preset.notes}`
  )
);

console.log(`Scaffolded ${dest}`);
