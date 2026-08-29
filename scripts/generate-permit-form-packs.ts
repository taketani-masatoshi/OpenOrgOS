#!/usr/bin/env node
/**
 * JP 許認可フォームパック生成（欠落分の MD/TeX + forms-catalog 追記）。
 *
 * 正本 CSV: steward/jurisdiction-packs/JP/modules/jp_permit_registry/catalog/permit-types.csv
 * カタログ: .../seed/forms-catalog.yaml.example
 *
 * Usage:
 *   node --import tsx scripts/generate-permit-form-packs.ts
 *   node --import tsx scripts/generate-permit-form-packs.ts --dry-run
 *   node --import tsx scripts/generate-permit-form-packs.ts --copy-tenant mal
 *
 * Idempotent: form が既にある permit_type_id はスキップ。template ファイルが既にあれば上書きしない。
 * form-alcohol-sales に template_tex が無い場合のみ TeX を追加する。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MODULE_ROOT = path.join(
  ROOT,
  "steward/jurisdiction-packs/JP/modules/jp_permit_registry",
);
const CSV_PATH = path.join(MODULE_ROOT, "catalog/permit-types.csv");
const CATALOG_PATH = path.join(MODULE_ROOT, "seed/forms-catalog.yaml.example");
const TEMPLATES_DIR = path.join(MODULE_ROOT, "seed/templates");

const MIN_REQUIRED_FIELDS = [
  "applicant_name",
  "applicant_address",
  "representative_name",
  "site_address",
  "filing_date",
] as const;

type PermitTypeRow = {
  permit_type_id: string;
  name_ja: string;
  category: string;
  legal_basis: string;
  issuer_type: string;
  issuer_label_ja: string;
};

type FormEntry = {
  id: string;
  permit_type_ids: string[];
  name_ja?: string;
  template_md?: string;
  template_tex?: string;
  required_fields?: string[];
  official_form_notes?: string;
  output_format?: string;
};

function argFlag(name: string): boolean {
  return process.argv.includes(name);
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function parseCsv(text: string): PermitTypeRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row as PermitTypeRow;
  });
}

function slugFromPermitTypeId(permitTypeId: string): string {
  return permitTypeId.replace(/^pt-/, "");
}

/** issuer_type（なければ category）から汎用の提出先ラベルを推定 */
function authorityLabelJa(row: PermitTypeRow): string {
  if (row.issuer_label_ja?.trim()) return row.issuer_label_ja.trim();
  const issuer = (row.issuer_type || "").toLowerCase();
  const map: Record<string, string> = {
    municipal: "市区町村",
    prefectural: "都道府県",
    national: "国の所管官庁",
    fire_department: "消防署",
    health_center: "保健所",
    mlit: "国土交通省",
    mlit_regional: "地方運輸局",
    customs: "税関",
    police: "公安委員会（経由警察署）",
    ppc: "個人情報保護委員会",
  };
  if (map[issuer]) return map[issuer];
  return "管轄行政機関";
}

function mdTemplate(nameJa: string): string {
  return `# ${nameJa}申請書（内部提出用ひな形）

- 申請 ID: {{application_id}}
- 種別: {{permit_type_name}}
- 申請日: {{filing_date}}

## 申請人
- 名称: {{applicant_name}}
- 住所: {{applicant_address}}
- 法人番号: {{corporate_number}}
- 資本金: {{share_capital_yen_ja}}
- 設立日: {{established_date}}
- 事業内容: {{business_description}}

## 代表者・役員
- 代表者氏名: {{representative_name}}
- 代表者住所: {{representative_address}}
- 役員: {{directors_list}}

## 事業所
- 名称: {{site_name}}
- 所在地: {{site_address}}
- 構造・用途: {{structure_use}} / {{property_structure}}
- 備考: {{business_type}}

## 連絡
- Web: {{website}}
- メール: {{contact_email}}

公式: {{official_form_url}}
`;
}

function texTemplate(nameJa: string): string {
  return `\\documentclass[11pt,a4paper]{article}
\\usepackage{fontspec}
\\usepackage{xeCJK}
\\usepackage{geometry}
\\geometry{margin=25mm}
\\setmainfont{Hiragino Sans}
\\setCJKmainfont{Hiragino Sans}

\\begin{document}
\\begin{center}
{\\Large ${nameJa}申請書（内部提出用ひな形）}
\\end{center}

\\vspace{1em}
\\noindent 申請 ID: {{application_id}} \\\\
許認可種別: {{permit_type_name}} \\\\
申請日: {{filing_date}}

\\section*{申請人}
\\begin{tabular}{ll}
商号又は名称 & {{applicant_name}} \\\\
本店所在地 & {{applicant_address}} \\\\
法人番号 & {{corporate_number}} \\\\
資本金 & {{share_capital_yen_ja}} \\\\
設立年月日 & {{established_date}} \\\\
事業の内容 & {{business_description}} \\\\
\\end{tabular}

\\section*{代表者・役員}
\\begin{tabular}{ll}
代表者氏名 & {{representative_name}} \\\\
代表者住所 & {{representative_address}} \\\\
役員 & {{directors_list}} \\\\
\\end{tabular}

\\section*{事業所・対象}
\\begin{tabular}{ll}
名称 & {{site_name}} \\\\
所在地 & {{site_address}} \\\\
構造・用途 & {{structure_use}} \\\\
業態・備考 & {{business_type}} \\\\
\\end{tabular}

\\vfill
\\small 公式参照: {{official_form_url}}
\\par\\noindent\\small 本ひな形は OpenOrgOS 内部整理用。提出前に管轄機関の最新様式を確認すること。
\\end{document}
`;
}

function writeIfMissing(filePath: string, content: string, dryRun: boolean): boolean {
  if (fs.existsSync(filePath)) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
  }
  return true;
}

function yamlQuote(s: string): string {
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.includes('"') || s.includes("'")) {
    return JSON.stringify(s);
  }
  return s;
}

function formatFormYaml(opts: {
  id: string;
  permitTypeId: string;
  nameJa: string;
  slug: string;
  authorityLabelJa: string;
  legalBasis?: string;
}): string {
  const fields = MIN_REQUIRED_FIELDS.map((f) => `      - ${f}`).join("\n");
  const notes = opts.legalBasis
    ? `\n    notes: ${yamlQuote(`legal_basis: ${opts.legalBasis}`)}`
    : "";
  return `
  - id: ${opts.id}
    permit_type_ids: [${opts.permitTypeId}]
    name_ja: ${yamlQuote(opts.nameJa)}
    template_md: templates/${opts.slug}-application.md
    template_tex: templates/${opts.slug}-application.tex
    required_fields:
${fields}
    official_form_notes: 管轄機関の最新様式を確認すること
    output_format: tex
    submission:
      authority_label_ja: ${yamlQuote(opts.authorityLabelJa)}
      channel: counter${notes}
`;
}

/** form-alcohol-sales に template_tex / output_format: tex を外科的に追加 */
function patchAlcoholSales(catalogText: string, dryRun: boolean): {
  text: string;
  updated: boolean;
  createdTex: boolean;
} {
  const texExample = path.join(TEMPLATES_DIR, "alcohol-sales-application.tex.example");
  let createdTex = false;
  if (!fs.existsSync(texExample)) {
    createdTex = writeIfMissing(texExample, texTemplate("酒類販売業免許"), dryRun);
  }

  if (
    /id:\s*form-alcohol-sales[\s\S]*?template_tex:\s*templates\/alcohol-sales-application\.tex/.test(
      catalogText,
    )
  ) {
    // already has template_tex near alcohol form — still fix output_format if needed
    let text = catalogText;
    let updated = false;
    // Replace alcohol block's output_format: md → tex (only within that form's window)
    text = text.replace(
      /(id:\s*form-alcohol-sales[\s\S]*?)(output_format:\s*)md(\b)/,
      (_m, pre, key, _suf) => {
        updated = true;
        return `${pre}${key}tex`;
      },
    );
    return { text, updated: updated || createdTex, createdTex };
  }

  let updated = false;
  let text = catalogText.replace(
    /(id:\s*form-alcohol-sales\n[\s\S]*?template_md:\s*templates\/alcohol-sales-application\.md\n)/,
    (m) => {
      updated = true;
      return `${m}    template_tex: templates/alcohol-sales-application.tex\n`;
    },
  );
  text = text.replace(
    /(id:\s*form-alcohol-sales[\s\S]*?)(output_format:\s*)md(\b)/,
    (_m, pre, key) => {
      updated = true;
      return `${pre}${key}tex`;
    },
  );
  text = text.replace(
    /(id:\s*form-alcohol-sales[\s\S]*?official_form_notes:\s*)([^\n]+)/,
    (m, pre, notes) => {
      if (String(notes).includes("TeX 未整備") || String(notes).includes("内部整理用 MD")) {
        updated = true;
        return `${pre}管轄機関の最新様式を確認すること`;
      }
      return m;
    },
  );
  return { text, updated: updated || createdTex, createdTex };
}

function bumpUpdated(catalogText: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (/^updated:\s*/m.test(catalogText)) {
    return catalogText.replace(/^updated:\s*.*$/m, `updated: "${today}"`);
  }
  return catalogText.replace(
    /^(jurisdiction:\s*.*)$/m,
    `$1\nupdated: "${today}"`,
  );
}

function ensureGeneratorComment(catalogText: string): string {
  const line =
    "# 欠落パック再生成: node --import tsx scripts/generate-permit-form-packs.ts（idempotent）";
  if (catalogText.includes("generate-permit-form-packs.ts")) return catalogText;
  return catalogText.replace(
    /(# PDF は OOO 共通[^\n]*\n)/,
    `$1${line}\n`,
  );
}

function main(): void {
  const dryRun = argFlag("--dry-run");
  const copyTenant = argValue("--copy-tenant");

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  let catalogText = fs.readFileSync(CATALOG_PATH, "utf8");
  const doc = parseYaml(catalogText) as { forms: FormEntry[] };
  if (!Array.isArray(doc.forms)) {
    throw new Error("forms-catalog.yaml.example: forms[] がありません");
  }

  const beforeCount = doc.forms.length;
  const covered = new Set<string>();
  const existingFormIds = new Set<string>();
  for (const form of doc.forms) {
    existingFormIds.add(form.id);
    for (const id of form.permit_type_ids ?? []) covered.add(id);
  }

  const createdFormIds: string[] = [];
  const createdFiles: string[] = [];

  const alcohol = patchAlcoholSales(catalogText, dryRun);
  catalogText = alcohol.text;
  if (alcohol.createdTex) {
    createdFiles.push("alcohol-sales-application.tex.example");
  }

  const missing = rows.filter((r) => r.permit_type_id && !covered.has(r.permit_type_id));
  const appendBlocks: string[] = [];

  for (const row of missing) {
    const slug = slugFromPermitTypeId(row.permit_type_id);
    const formId = `form-${slug}`;
    const mdExample = path.join(TEMPLATES_DIR, `${slug}-application.md.example`);
    const texExample = path.join(TEMPLATES_DIR, `${slug}-application.tex.example`);

    if (writeIfMissing(mdExample, mdTemplate(row.name_ja), dryRun)) {
      createdFiles.push(path.basename(mdExample));
    }
    if (writeIfMissing(texExample, texTemplate(row.name_ja), dryRun)) {
      createdFiles.push(path.basename(texExample));
    }

    if (existingFormIds.has(formId)) continue;

    appendBlocks.push(
      formatFormYaml({
        id: formId,
        permitTypeId: row.permit_type_id,
        nameJa: `${row.name_ja}申請書（ひな形）`,
        slug,
        authorityLabelJa: authorityLabelJa(row),
        legalBasis: row.legal_basis || undefined,
      }),
    );
    createdFormIds.push(formId);
    existingFormIds.add(formId);
    covered.add(row.permit_type_id);
  }

  if (appendBlocks.length > 0) {
    const trimmed = catalogText.replace(/\s*$/, "");
    catalogText = `${trimmed}\n${appendBlocks.join("")}\n`;
  }

  catalogText = bumpUpdated(catalogText);
  catalogText = ensureGeneratorComment(catalogText);

  if (!dryRun) {
    fs.writeFileSync(CATALOG_PATH, catalogText, "utf8");
  }

  if (copyTenant && !dryRun) {
    const dest = path.join(
      ROOT,
      "tenants",
      copyTenant,
      "data/permit-registry/forms-catalog.yaml",
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(CATALOG_PATH, dest);
    console.log(`copied → ${path.relative(ROOT, dest)}`);
  }

  const afterDoc = parseYaml(catalogText) as { forms: FormEntry[] };
  console.log(
    JSON.stringify(
      {
        dryRun,
        forms_before: beforeCount,
        forms_after: afterDoc.forms.length,
        new_form_ids: createdFormIds,
        alcohol_sales: {
          updated: alcohol.updated,
          createdTex: alcohol.createdTex,
        },
        created_template_files_count: createdFiles.length,
        missing_types_count: missing.length,
      },
      null,
      2,
    ),
  );
}

main();
