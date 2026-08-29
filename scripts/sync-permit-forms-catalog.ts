#!/usr/bin/env node
/**
 * Fill forms-catalog.yaml from the national permit-types catalog.
 *
 * Hand-written form entries stay as they are; every permit type they do not
 * cover gets an internal draft form backed by the template pair that ships
 * in the module seed. Re-running is idempotent.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ROOT_DIR } from "../src/lib/tenant.js";

const MODULE_DIR = join(
  ROOT_DIR,
  "steward/jurisdiction-packs/JP/modules/jp_permit_registry"
);
const CSV_PATH = join(MODULE_DIR, "catalog/permit-types.csv");
const TEMPLATE_DIR = join(MODULE_DIR, "seed/templates");
const TARGETS = [
  join(MODULE_DIR, "seed/forms-catalog.yaml.example"),
  join(ROOT_DIR, "tenants/mal/data/permit-registry/forms-catalog.yaml"),
];

const ISSUER_LABELS: Record<string, string> = {
  municipal: "市区町村",
  prefectural: "都道府県",
  national: "所管省庁",
  fire_department: "消防署",
  health_center: "保健所",
  tax_office: "税務署",
  mlit: "国土交通省",
  mlit_regional: "地方運輸局・地方整備局",
  moj: "法務局",
  meti: "経済産業省",
  mhlw: "厚生労働省",
  fsa: "金融庁",
  ppc: "個人情報保護委員会",
  police: "警察署（公安委員会）",
  customs: "税関",
};

interface CsvRow {
  permit_type_id: string;
  name_ja: string;
  issuer_type: string;
  issuer_label_ja: string;
}

function parseCsv(text: string): CsvRow[] {
  const [header, ...lines] = text.trim().split("\n");
  const cols = header.split(",");
  return lines
    .filter((line) => line.trim())
    .map((line) => {
      const values: string[] = [];
      let cur = "";
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === "," && !quoted) {
          values.push(cur);
          cur = "";
        } else cur += ch;
      }
      values.push(cur);
      const row: Record<string, string> = {};
      cols.forEach((c, i) => (row[c] = (values[i] ?? "").trim()));
      return row as unknown as CsvRow;
    });
}

function slug(permitTypeId: string): string {
  return permitTypeId.replace(/^pt-/, "");
}

function authorityLabel(row: CsvRow): string {
  return row.issuer_label_ja || ISSUER_LABELS[row.issuer_type] || "所管窓口";
}

function buildGeneratedForm(row: CsvRow): Record<string, unknown> {
  const base = slug(row.permit_type_id);
  const hasTex = existsSync(join(TEMPLATE_DIR, `${base}-application.tex.example`));
  const form: Record<string, unknown> = {
    id: `form-${base}`,
    permit_type_ids: [row.permit_type_id],
    name_ja: `${row.name_ja}申請書（ひな形）`,
    template_md: `templates/${base}-application.md`,
    required_fields: [
      "applicant_name",
      "applicant_address",
      "representative_name",
      "site_address",
      "filing_date",
    ],
    output_format: hasTex ? "tex" : "md",
    submission: { authority_label_ja: authorityLabel(row) },
    official_form_notes:
      "内部整理用ひな形。提出前に管轄窓口の最新様式を確認すること。",
  };
  if (hasTex) form.template_tex = `templates/${base}-application.tex`;
  return form;
}

function syncFile(path: string, rows: CsvRow[]): { added: number } {
  const doc = YAML.parse(readFileSync(path, "utf-8")) as {
    forms: Record<string, unknown>[];
  };
  const covered = new Set<string>();
  for (const form of doc.forms) {
    for (const id of (form.permit_type_ids as string[]) ?? []) covered.add(id);
  }
  const added = rows.filter((r) => !covered.has(r.permit_type_id)).map(buildGeneratedForm);
  doc.forms = [...doc.forms, ...added];
  writeFileSync(path, YAML.stringify(doc, { lineWidth: 0 }), "utf-8");
  return { added: added.length };
}

const rows = parseCsv(readFileSync(CSV_PATH, "utf-8"));
for (const target of TARGETS) {
  const { added } = syncFile(target, rows);
  console.log(`${target.replace(ROOT_DIR + "/", "")}: +${added} forms (${rows.length} types)`);
}
