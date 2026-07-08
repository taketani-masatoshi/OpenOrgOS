#!/usr/bin/env node
/**
 * Generates steward/jurisdictions/countries.yaml — ISO 3166-1 alpha-2 (ccTLD 相当)
 * Run: node scripts/generate-countries-registry.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "steward/jurisdictions/countries.yaml");

/** @type {readonly string[]} ISO 3166-1 alpha-2 */
const ISO_ALPHA2 = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
];

const FULL_PACKS = new Set(["JP", "US", "SG", "EE", "HK"]);

/** Major currency by code — stubs default USD */
const CURRENCY = {
  JP: "JPY", US: "USD", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
  NL: "EUR", BE: "EUR", AT: "EUR", IE: "EUR", PT: "EUR", FI: "EUR", EE: "EUR", GR: "EUR",
  SG: "SGD", HK: "HKD", CN: "CNY", TW: "TWD", KR: "KRW", IN: "INR", AU: "AUD", NZ: "NZD",
  CA: "CAD", MX: "MXN", BR: "BRL", CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN",
  CZ: "CZK", HU: "HUF", RO: "RON", TR: "TRY", ZA: "ZAR", AE: "AED", SA: "SAR", IL: "ILS",
  TH: "THB", MY: "MYR", ID: "IDR", PH: "PHP", VN: "VND", AR: "ARS", CL: "CLP", CO: "COP",
  EG: "EGP", NG: "NGN", KE: "KES", PK: "PKR", BD: "BDT", RU: "RUB", UA: "UAH",
};

const dnEn = new Intl.DisplayNames("en", { type: "region" });
const dnJa = new Intl.DisplayNames("ja", { type: "region" });

const countries = {};
for (const code of ISO_ALPHA2) {
  const tier = FULL_PACKS.has(code) ? "full" : "stub";
  const entry = {
    name: dnEn.of(code) ?? code,
    name_ja: dnJa.of(code) ?? code,
    default_currency: CURRENCY[code] ?? "USD",
    tier,
  };
  if (tier === "full") {
    entry.pack_root = `steward/jurisdiction-packs/${code}`;
  }
  countries[code] = entry;
}

const doc = {
  version: 1,
  description:
    "ISO 3166-1 alpha-2 法域一覧 · tier full=実装 pack · stub=共有 _stub · 正本: scripts/generate-countries-registry.mjs",
  countries,
};

writeFileSync(
  OUT,
  `# Jurisdiction countries — ISO 3166-1 alpha-2 (ccTLD 相当)\n# Generated: ${new Date().toISOString().slice(0, 10)} · Re-run: node scripts/generate-countries-registry.mjs\n\n${YAML.stringify(doc)}`,
  "utf-8"
);
console.log(`Wrote ${OUT} (${ISO_ALPHA2.length} countries, ${FULL_PACKS.size} full packs)`);
