import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { z } from "zod";
import type { Company } from "../../../../../../schemas/company.js";
import type { Property } from "../../../../../../schemas/property.js";
import {
  permitApplicationDraftFileSchema,
  permitApplicationRegistryFileSchema,
  permitFieldMapFileSchema,
  permitFormsCatalogFileSchema,
  permitTypesCatalogFileSchema,
  type PermitApplicationDraftFile,
  type PermitApplicationEntry,
  type PermitFieldMapping,
  type PermitFormEntry,
} from "../../../../../../schemas/jp-permit-registry.js";
import { loadCompany, loadProperty } from "../../../../../../src/lib/data.js";
import { detectLatexEngine, writeTexAndCompile } from "../../../../../../src/lib/latex-compile.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate, getDocsDir, resolveTenantPath, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import { MODULE_ID } from "./lib.js";

const CATALOG_FILES = {
  types: "permit-types-catalog.yaml",
  forms: "forms-catalog.yaml",
  fieldMap: "field-map.yaml",
} as const;

export interface PermitFieldContext {
  company: Company;
  property?: Property;
  application: PermitApplicationEntry;
  overrides?: Record<string, string>;
}

export interface ChecklistResult {
  missing: string[];
  ready_for_export: boolean;
}

function loadDataFile<S extends z.ZodTypeAny>(filename: string, schema: S) {
  return loadModuleDataFile(MODULE_ID, filename, schema);
}

function loadCatalogFile<S extends z.ZodTypeAny>(filename: string, schema: S) {
  return (
    loadDataFile(filename, schema) ??
    loadDataFile(`${filename}.example`, schema)
  );
}

function toReiwaDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const reiwa = y - 2018;
  return `令和${reiwa}年${m}月${d}日`;
}

function shortBusinessDescription(desc?: string): string {
  if (!desc?.trim()) return "";
  return desc
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Web:") && !l.startsWith("旧"))
    .slice(0, 3)
    .join(" ");
}

function primaryRepresentative(company: Company): string {
  const fromDirectors = company.directors?.find((d) => d.role?.includes("代表"))?.name;
  if (fromDirectors) return fromDirectors;
  return company.representative?.split(/[、,]/)[0]?.trim() ?? "";
}

export function resolvePermitFieldSource(source: string, ctx: PermitFieldContext): string {
  const [root, ...rest] = source.split(".");
  if (root === "company") {
    const key = rest.join(".");
    if (key === "representative_primary") return primaryRepresentative(ctx.company);
    if (key === "business_description_short") return shortBusinessDescription(ctx.company.business_description);
    const val = (ctx.company as Record<string, unknown>)[key];
    return val != null ? String(val) : "";
  }
  if (root === "property" && ctx.property) {
    let cur: unknown = ctx.property;
    for (const part of rest) {
      if (cur == null || typeof cur !== "object") return "";
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur != null ? String(cur) : "";
  }
  if (root === "application") {
    const key = rest.join(".");
    if (ctx.overrides?.[key]) return ctx.overrides[key];
    if (ctx.application.field_overrides?.[key]) return ctx.application.field_overrides[key];
    return "";
  }
  if (root === "computed") {
    if (rest.join(".") === "today_iso") return currentDate();
    if (rest.join(".") === "today_reiwa") return toReiwaDate(currentDate());
  }
  return "";
}

export function buildFieldsFromMap(
  mappings: PermitFieldMapping[],
  ctx: PermitFieldContext
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const map of mappings) {
    let value = resolvePermitFieldSource(map.source, ctx);
    if (map.format === "reiwa" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      value = toReiwaDate(value);
    }
    fields[map.form_field] = value;
  }
  return fields;
}

function resolveTemplatePath(templateRel: string): string | null {
  const candidates = [
    join(getModuleDataDir(MODULE_ID), templateRel),
    join(getModuleDataDir(MODULE_ID), `${templateRel}.example`),
    join(getModuleSeedDir(MODULE_ID), templateRel),
    join(getModuleSeedDir(MODULE_ID), `${templateRel}.example`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadTemplate(templateRel: string): string {
  const path = resolveTemplatePath(templateRel);
  if (!path) throw new Error(`Template not found: ${templateRel}`);
  return readFileSync(path, "utf-8");
}

export function renderPermitTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value || "（未記載）");
  }
  return out;
}

function findFormForPermitType(
  forms: PermitFormEntry[],
  permitTypeId: string
): PermitFormEntry | undefined {
  return forms.find((f) => f.permit_type_ids.includes(permitTypeId));
}

function draftPath(applicationId: string): string {
  return join(getModuleDataDir(MODULE_ID), "drafts", `${applicationId}.yaml`);
}

function docsRoot(applicationId: string): string {
  return join(getDocsDir(), "permit-applications", applicationId);
}

function loadDraft(applicationId: string): PermitApplicationDraftFile | null {
  const path = draftPath(applicationId);
  if (!existsSync(path)) return null;
  const raw = YAML.parse(readFileSync(path, "utf-8"));
  return permitApplicationDraftFileSchema.parse(raw);
}

function saveDraft(draft: PermitApplicationDraftFile): string {
  const path = draftPath(draft.application_id);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, YAML.stringify(draft), "utf-8");
  return path;
}

function getApplication(applicationId: string): PermitApplicationEntry | null {
  const registry = loadDataFile("application-registry.yaml", permitApplicationRegistryFileSchema);
  if (!registry) return null;
  return registry.data.applications.find((a) => a.id === applicationId) ?? null;
}

function mergeTemplateVars(
  draft: PermitApplicationDraftFile,
  form: PermitFormEntry,
  permitTypeName: string
): Record<string, string> {
  const merged = { ...draft.fields, ...draft.manual_overrides };
  return {
    ...merged,
    application_id: draft.application_id,
    permit_type_id: draft.permit_type_id,
    permit_type_name: permitTypeName,
    official_form_url: form.official_form_url ?? "",
  };
}

export function runPermitApplicationChecklistOnDraft(
  draft: PermitApplicationDraftFile,
  form: PermitFormEntry
): ChecklistResult {
  const merged = { ...draft.fields, ...draft.manual_overrides };
  const missing = form.required_fields.filter((field) => !String(merged[field] ?? "").trim());
  return { missing, ready_for_export: missing.length === 0 };
}

export function runPermitApplicationPrepare(opts: {
  application: string;
  structureUse?: string;
  businessType?: string;
  licenseType?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const app = getApplication(opts.application);
  if (!app) {
    console.error(`Application not found: ${opts.application}`);
    process.exit(1);
  }

  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const fieldMap = loadCatalogFile(CATALOG_FILES.fieldMap, permitFieldMapFileSchema);
  if (!formsCatalog || !fieldMap) {
    console.error("forms-catalog.yaml or field-map.yaml missing");
    process.exit(1);
  }

  const form = findFormForPermitType(formsCatalog.data.forms, app.permit_type_id);
  if (!form) {
    console.error(`No form defined for permit type ${app.permit_type_id}`);
    process.exit(1);
  }

  const company = loadCompany();
  const property = app.property_id ? loadProperty(app.property_id) : undefined;
  const overrides: Record<string, string> = {};
  if (opts.structureUse) overrides.structure_use = opts.structureUse;
  if (opts.businessType) overrides.business_type = opts.businessType;
  if (opts.licenseType) overrides.license_type = opts.licenseType;

  const ctx: PermitFieldContext = { company, property, application: app, overrides };
  const fields = buildFieldsFromMap(fieldMap.data.mappings, ctx);

  const draft: PermitApplicationDraftFile = {
    application_id: app.id,
    permit_type_id: app.permit_type_id,
    form_id: form.id,
    property_id: app.property_id,
    status: "preparing",
    prepared_at: currentDate(),
    auto_filled_from: {
      company: "data/company.yaml",
      property: property ? `data/properties/${property.id}.yaml` : undefined,
      field_map: "field-map.yaml",
    },
    fields,
    manual_overrides: overrides,
    checklist: { missing: [], ready_for_export: false },
  };

  const checklist = runPermitApplicationChecklistOnDraft(draft, form);
  draft.checklist = { last_run: currentDate(), ...checklist };

  if (opts.json) {
    console.log(JSON.stringify({ draft, checklist }, null, 2));
    return;
  }

  console.log(`# 申請ドラフト準備 — ${app.id}\n`);
  console.log(`種別: ${app.permit_type_id} · 書式: ${form.name_ja}`);
  console.log(`自動入力: ${Object.keys(fields).length} フィールド`);
  if (checklist.missing.length) {
    console.log(`\n未充足（${checklist.missing.length}）: ${checklist.missing.join(", ")}`);
  } else {
    console.log("\n必須項目: 充足");
  }

  if (opts.write) {
    const path = saveDraft(draft);
    console.log(`\n✓ 保存: ${path}`);
    console.log("次: `operations permit application checklist` → `draft` → `export-pdf`");
  } else {
    console.log("\n`--write` で data/permit-registry/drafts/ に保存");
  }
}

export function runPermitApplicationShow(opts: { application: string; json?: boolean }): void {
  const draft = loadDraft(opts.application);
  if (!draft) {
    console.error(`Draft not found: ${opts.application} — run application prepare --write first`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(draft, null, 2));
    return;
  }
  console.log(`# 申請ドラフト — ${draft.application_id}\n`);
  console.log(`form: ${draft.form_id} · status: ${draft.status}`);
  for (const [k, v] of Object.entries({ ...draft.fields, ...draft.manual_overrides })) {
    console.log(`- ${k}: ${v || "（空）"}`);
  }
}

export function runPermitApplicationChecklist(opts: {
  application: string;
  write?: boolean;
  json?: boolean;
}): void {
  const draft = loadDraft(opts.application);
  if (!draft) {
    console.error(`Draft not found: ${opts.application}`);
    process.exit(1);
  }
  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const form = formsCatalog?.data.forms.find((f) => f.id === draft.form_id);
  if (!form) {
    console.error(`Form ${draft.form_id} not found`);
    process.exit(1);
  }

  const result = runPermitApplicationChecklistOnDraft(draft, form);
  draft.checklist = { last_run: currentDate(), ...result };
  if (opts.write) saveDraft(draft);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# チェックリスト — ${opts.application}\n`);
  if (result.ready_for_export) {
    console.log("✓ 必須項目充足 — export-pdf 可能");
  } else {
    console.log("✗ 未充足:");
    for (const m of result.missing) console.log(`  - ${m}`);
  }
}

export function runPermitApplicationDraft(opts: {
  application: string;
  write?: boolean;
  json?: boolean;
}): void {
  const draft = loadDraft(opts.application);
  if (!draft) {
    console.error(`Draft not found: ${opts.application}`);
    process.exit(1);
  }
  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const typesCatalog = loadCatalogFile(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const form = formsCatalog?.data.forms.find((f) => f.id === draft.form_id);
  if (!form) {
    console.error(`Form ${draft.form_id} not found`);
    process.exit(1);
  }

  const permitTypeName =
    typesCatalog?.data.permit_types.find((t) => t.id === draft.permit_type_id)?.name_ja ??
    draft.permit_type_id;
  const vars = mergeTemplateVars(draft, form, permitTypeName);
  const md = renderPermitTemplate(loadTemplate(form.template_md), vars);

  if (opts.json) {
    console.log(JSON.stringify({ md_path: join(docsRoot(draft.application_id), "application.md"), md }, null, 2));
    return;
  }

  console.log(md);
  if (opts.write) {
    const outDir = docsRoot(draft.application_id);
    mkdirSync(outDir, { recursive: true });
    const mdPath = join(outDir, "application.md");
    writeTrackedFile(mdPath, md);
    draft.export = { ...draft.export, md_path: mdPath.replace(resolveTenantPath(""), "").replace(/^\//, "") };
    saveDraft(draft);
    console.error(`\n✓ MD: ${mdPath}`);
  }
}

export function runPermitApplicationExportPdf(opts: {
  application: string;
  write?: boolean;
  force?: boolean;
  json?: boolean;
}): void {
  const draft = loadDraft(opts.application);
  if (!draft) {
    console.error(`Draft not found: ${opts.application}`);
    process.exit(1);
  }
  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const typesCatalog = loadCatalogFile(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  const form = formsCatalog?.data.forms.find((f) => f.id === draft.form_id);
  if (!form) {
    console.error(`Form ${draft.form_id} not found`);
    process.exit(1);
  }

  const checklist = runPermitApplicationChecklistOnDraft(draft, form);
  if (!checklist.ready_for_export && !opts.force) {
    console.error("Checklist incomplete. Fix missing fields or use --force");
    console.error(`Missing: ${checklist.missing.join(", ")}`);
    process.exit(1);
  }

  const permitTypeName =
    typesCatalog?.data.permit_types.find((t) => t.id === draft.permit_type_id)?.name_ja ??
    draft.permit_type_id;
  const vars = mergeTemplateVars(draft, form, permitTypeName);

  if (form.output_format === "md" || !form.template_tex) {
    const md = renderPermitTemplate(loadTemplate(form.template_md), vars);
    if (!opts.write) {
      console.log(md);
      console.error("\nこの書式は MD 出力のみ。`application draft --write` を使用");
      return;
    }
    const outDir = join(getDocsDir(), "io", "outbox", "submissions");
    mkdirSync(outDir, { recursive: true });
    const mdPath = join(outDir, `${draft.application_id}-application.md`);
    writeTrackedFile(mdPath, md);
    console.log(`✓ 提出用 MD: ${mdPath}`);
    return;
  }

  const engine = detectLatexEngine();
  if (!engine) {
    console.error("LaTeX (xelatex) not installed. Install MacTeX / TeX Live, or use `application draft --write` for MD only.");
    process.exit(1);
  }

  const texContent = renderPermitTemplate(loadTemplate(form.template_tex), vars);
  const outDir = docsRoot(draft.application_id);
  mkdirSync(outDir, { recursive: true });
  const texPath = join(outDir, "application.tex");

  if (!opts.write) {
    console.log(texContent);
    console.error(`\nEngine: ${engine} · \`--write\` で ${texPath} → PDF`);
    return;
  }

  const pdfOutDir = join(getDocsDir(), "io", "outbox", "submissions");
  mkdirSync(pdfOutDir, { recursive: true });
  const result = writeTexAndCompile(texContent, texPath, { engine, workDir: outDir });
  const finalPdf = join(pdfOutDir, `${draft.application_id}-application.pdf`);
  const pdfBytes = readFileSync(result.pdfPath);
  writeFileSync(finalPdf, pdfBytes);

  draft.export = {
    md_path: draft.export?.md_path,
    tex_path: texPath.replace(resolveTenantPath(""), "").replace(/^\//, ""),
    pdf_path: finalPdf.replace(resolveTenantPath(""), "").replace(/^\//, ""),
    exported_at: currentDate(),
  };
  draft.checklist = { last_run: currentDate(), ...checklist, ready_for_export: true };
  saveDraft(draft);

  if (opts.json) {
    console.log(JSON.stringify({ pdf: finalPdf, engine: result.engine }, null, 2));
    return;
  }

  console.log(`✓ PDF: ${finalPdf}`);
  console.log(`  TeX: ${texPath} · engine: ${result.engine}`);
  if (form.official_form_notes) console.log(`  注意: ${form.official_form_notes}`);
}
