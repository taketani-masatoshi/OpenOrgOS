#!/usr/bin/env node
/**
 * Clone sg-demo skeleton for a new jurisdiction demo tenant.
 * Usage: node scripts/scaffold-demo-tenant.mjs AU|TW|MY|CN
 */
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = process.argv[2]?.toUpperCase();
const PRESETS = {
  AU: { currency: "AUD", locale: "en-AU", entity: "proprietary_ltd", name: "Sample Australia Pty Ltd", display: "AU Demo" },
  TW: { currency: "TWD", locale: "zh-TW", entity: "private_ltd", name: "Sample Taiwan Co., Ltd.", display: "TW Demo" },
  MY: { currency: "MYR", locale: "en-MY", entity: "sdn_bhd", name: "Sample Malaysia Sdn Bhd", display: "MY Demo" },
  CN: { currency: "CNY", locale: "zh-CN", entity: "llc", name: "Sample China Co., Ltd.", display: "CN Demo" },
  AE: { currency: "AED", locale: "en-AE", entity: "llc", name: "Sample UAE LLC", display: "AE Demo" },
  RU: { currency: "RUB", locale: "ru-RU", entity: "ooo", name: "Sample Russia OOO", display: "RU Demo" },
  EU: { currency: "EUR", locale: "en-EU", entity: "gmbh", name: "Sample EU GmbH", display: "EU Demo", subdivision: "DE" },
};

if (!code || !PRESETS[code]) {
  console.error("Usage: node scripts/scaffold-demo-tenant.mjs AU|TW|MY|CN|AE|RU|EU");
  process.exit(1);
}

const preset = PRESETS[code];

const src = join(ROOT, "tenants/sg-demo");
const dest = join(ROOT, `tenants/${code.toLowerCase()}-demo`);
if (existsSync(dest)) {
  console.error(`Already exists: ${dest}`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });

function walkReplace(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walkReplace(p);
      continue;
    }
    if (name.endsWith(".jsonl")) continue;
    let text = readFileSync(p, "utf-8");
    text = text
      .replace(/sg-demo/g, `${code.toLowerCase()}-demo`)
      .replace(/\bSG\b/g, code)
      .replace(/REG-SG-/g, `REG-${code}-`)
      .replace(/Sample Pte\. Ltd\./g, preset.name)
      .replace(/SG Demo/g, preset.display)
      .replace(/en-SG/g, preset.locale)
      .replace(/\bSGD\b/g, preset.currency)
      .replace(/pte_ltd/g, preset.entity)
      .replace(/SG jurisdiction pack reference tenant/g, `${code} jurisdiction pack reference tenant`);
    writeFileSync(p, text);
  }
}

walkReplace(dest);

const tenantPath = join(dest, "tenant.yaml");
let tenantYaml = readFileSync(tenantPath, "utf-8");
if (preset.subdivision) {
  if (!/^legal_subdivision:/m.test(tenantYaml)) {
    tenantYaml = tenantYaml.replace(
      /^entity_form:.*$/m,
      `legal_subdivision: ${preset.subdivision}\n$&`
    );
  } else {
    tenantYaml = tenantYaml.replace(/^legal_subdivision:.*$/m, `legal_subdivision: ${preset.subdivision}`);
  }
}
writeFileSync(tenantPath, tenantYaml);

console.log(`Scaffolded ${dest}`);
