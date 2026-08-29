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
  permitHandoffFileSchema,
  permitObligationInstancesFileSchema,
  permitObligationsCatalogFileSchema,
  permitRegistryFileSchema,
  permitTypesCatalogFileSchema,
  type PermitApplicationDraftFile,
  type PermitApplicationEntry,
  type PermitApplicationPhase,
  type PermitFieldMapping,
  type PermitFormEntry,
  type PermitHandoffEntry,
  type PermitInstanceEntry,
} from "../../../../../../schemas/jp-permit-registry.js";
import { loadCompany, loadProperty } from "../../../../../../src/lib/data.js";
import { registerOutboxItem } from "../../../../../../src/lib/document-io.js";
import { detectLatexEngine, writeTexAndCompile } from "../../../../../../src/lib/latex-compile.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import {
  currentDate,
  getDocsDir,
  resolveTenantPath,
  writeTrackedFile,
  writeYamlFile,
} from "../../../../../../src/lib/utils.js";
import {
  MODULE_ID as APP_MODULE,
  REGISTRY_MODULE_ID as REGISTRY_MODULE,
  listPermitTypeIdsFromCsv,
  loadCatalogCsv,
  loadPermitConditionsForType,
  type PermitConditionRow,
} from "./lib.js";
import { emitLicenseLifecycleEvent } from "../../../../../../src/lib/permit-license-events.js";

const CATALOG_FILES = {
  types: "permit-types-catalog.yaml",
  forms: "forms-catalog.yaml",
  fieldMap: "field-map.yaml",
  obligations: "obligations-catalog.yaml",
} as const;

export interface PermitFieldContext {
  company: Company;
  property?: Property;
  application: PermitApplicationEntry;
  overrides?: Record<string, string>;
}

export interface ChecklistResult {
  missing: string[];
  /** テンプレに出現するが空 → 出力時「（未記載）」になる欄 */
  blank_template_fields: string[];
  /** オペレータ／CEO への確認質問（提出可能水準まで） */
  clarify_questions: string[];
  ready_for_export: boolean;
  procedure_steps?: PermitConditionRow[];
  procedure_required_count?: number;
}

function loadAppDataFile<S extends z.ZodTypeAny>(filename: string, schema: S) {
  return loadModuleDataFile(APP_MODULE, filename, schema);
}

function loadRegistryDataFile<S extends z.ZodTypeAny>(filename: string, schema: S) {
  return loadModuleDataFile(REGISTRY_MODULE, filename, schema);
}

function loadCatalogFile<S extends z.ZodTypeAny>(filename: string, schema: S) {
  return (
    loadRegistryDataFile(filename, schema) ??
    loadRegistryDataFile(`${filename}.example`, schema)
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

function walkPath(root: unknown, parts: string[]): unknown {
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function formatCompanyValue(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val
      .map((item) => {
        if (item && typeof item === "object" && "name" in item) {
          const role = (item as { role?: string }).role;
          const name = String((item as { name: unknown }).name);
          return role ? `${name}（${role}）` : name;
        }
        return String(item);
      })
      .join("、");
  }
  return "";
}

export function resolvePermitFieldSource(source: string, ctx: PermitFieldContext): string {
  const [root, ...rest] = source.split(".");
  if (root === "company") {
    const key = rest.join(".");
    if (key === "representative_primary") return primaryRepresentative(ctx.company);
    if (key === "business_description_short") {
      return shortBusinessDescription(ctx.company.business_description);
    }
    if (key === "share_capital_yen") {
      const fromShare = ctx.company.share_capital?.amount_yen;
      const fromPublic = ctx.company.public_disclosure?.capital_yen;
      const yen = fromShare ?? fromPublic;
      return yen != null ? String(yen) : "";
    }
    if (key === "share_capital_yen_ja") {
      const raw = resolvePermitFieldSource("company.share_capital_yen", ctx);
      if (!raw) return "";
      const n = Number(raw);
      if (!Number.isFinite(n)) return raw;
      return `${n.toLocaleString("ja-JP")}円`;
    }
    if (key === "directors_list") {
      return formatCompanyValue(ctx.company.directors);
    }
    if (key === "website") {
      return ctx.company.public_disclosure?.website ?? "";
    }
    if (key === "contact_email") {
      return (
        ctx.company.public_disclosure?.contact_email ??
        ctx.company.public_disclosure?.representative_email ??
        ""
      );
    }
    if (key === "employees") {
      const n = ctx.company.public_disclosure?.employees;
      return n != null ? String(n) : "";
    }
    const nested = walkPath(ctx.company, rest);
    return formatCompanyValue(nested);
  }
  if (root === "property" && ctx.property) {
    const nested = walkPath(ctx.property, rest);
    return nested != null ? String(nested) : "";
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

/** Templates resolve from registry seed/data first, then app module. */
function resolveTemplatePath(templateRel: string): string | null {
  const candidates = [
    join(getModuleDataDir(REGISTRY_MODULE), templateRel),
    join(getModuleDataDir(REGISTRY_MODULE), `${templateRel}.example`),
    join(getModuleSeedDir(REGISTRY_MODULE), templateRel),
    join(getModuleSeedDir(REGISTRY_MODULE), `${templateRel}.example`),
    join(getModuleDataDir(APP_MODULE), templateRel),
    join(getModuleDataDir(APP_MODULE), `${templateRel}.example`),
    join(getModuleSeedDir(APP_MODULE), templateRel),
    join(getModuleSeedDir(APP_MODULE), `${templateRel}.example`),
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
  // leftover placeholders (not in vars) also count as blank
  out = out.replaceAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, "（未記載）");
  return out;
}

/** テンプレ内の {{field}} 一覧 */
export function listTemplatePlaceholders(template: string): string[] {
  const keys = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    keys.add(m[1]!);
  }
  return [...keys];
}

/**
 * 提出可能水準の確認質問（種別 × 空欄）。
 * Agent は PDF/draft に「（未記載）」がある場合、これらを人間に問い埋め直すこと。
 */
export function buildClarifyQuestions(opts: {
  permitTypeId: string;
  blankFields: string[];
}): string[] {
  const questions: string[] = [];
  const blanks = new Set(opts.blankFields);
  const type = opts.permitTypeId;

  if (blanks.has("business_type")) {
    if (type === "pt-antique-dealer" || type === "pt-used-car-dealer") {
      questions.push(
        "取り扱う古物の区分（業態）は何ですか？（例: 衣類、機械工具、自動車、時計・宝飾品類、金属くず類、書籍など。複数可）"
      );
    } else if (type.startsWith("pt-food") || type === "pt-food-restaurant") {
      questions.push("飲食店の業態・提供内容は何ですか？（例: 食堂、喫茶、焼肉、居酒屋）");
    } else {
      questions.push(
        "申請書の「業態・備考」に書く事業内容／取扱区分は何ですか？（空欄のままだと提出不可）"
      );
    }
  }
  if (blanks.has("site_manager_name")) {
    questions.push(
      "主たる営業所の管理者の氏名は誰ですか？（古物商は営業所ごとに管理者の選任が必要。代表者と同一でも可）"
    );
  }
  if (blanks.has("structure_use")) {
    questions.push("建物・施設の用途（構造用途）は何ですか？（例: 旅館業、事務所、店舗）");
  }
  if (blanks.has("license_type")) {
    questions.push("免許・許可の区分・種別コードは何ですか？（管轄庁の選択肢に合わせて）");
  }
  if (blanks.has("site_name") || blanks.has("site_address")) {
    questions.push(
      "主たる営業所（事業所）の名称・所在地は本店と同じですか？異なる場合は正式名称と住所を教えてください。"
    );
  }
  if (blanks.has("room_count")) {
    questions.push("客室数（または対象室数）は何室ですか？");
  }
  for (const field of opts.blankFields) {
    if (
      [
        "business_type",
        "structure_use",
        "license_type",
        "site_name",
        "site_address",
        "room_count",
        "site_manager_name",
        "applicant_name",
        "applicant_address",
        "representative_name",
        "representative_address",
        "filing_date",
        "permit_type_name",
        "application_id",
        "official_form_url",
      ].includes(field)
    ) {
      continue;
    }
    questions.push(`申請書欄「${field}」の記入内容を教えてください（現状未記載）。`);
  }
  if (!questions.length && opts.blankFields.length) {
    questions.push(
      `次の欄が未記載です。提出できる内容を教えてください: ${opts.blankFields.join(", ")}`
    );
  }
  return questions;
}

function blankFieldsForTemplate(
  draft: PermitApplicationDraftFile,
  form: PermitFormEntry,
  permitTypeName?: string
): string[] {
  const vars = mergeTemplateVars(draft, form, permitTypeName ?? draft.permit_type_id);
  let template = "";
  try {
    template = loadTemplate(form.template_md);
    if (form.template_tex) {
      try {
        template += "\n" + loadTemplate(form.template_tex);
      } catch {
        /* tex optional at checklist time */
      }
    }
  } catch {
    return form.required_fields.filter(
      (f) => !String({ ...draft.fields, ...draft.manual_overrides }[f] ?? "").trim()
    );
  }
  const placeholders = listTemplatePlaceholders(template);
  return placeholders.filter((key) => {
    if (key === "official_form_url") return false; // 任意ポータル URL
    return !String(vars[key] ?? "").trim();
  });
}

function findFormForPermitType(
  forms: PermitFormEntry[],
  permitTypeId: string
): PermitFormEntry | undefined {
  return forms.find((f) => f.permit_type_ids.includes(permitTypeId));
}

function draftPath(applicationId: string): string {
  return join(getModuleDataDir(APP_MODULE), "drafts", `${applicationId}.yaml`);
}

function docsRoot(applicationId: string): string {
  return join(getDocsDir(), "permit-applications", applicationId);
}

function applicationRegistryPath(): string {
  return join(getModuleDataDir(APP_MODULE), "application-registry.yaml");
}

function handoffPath(applicationId: string): string {
  return join(getModuleDataDir(APP_MODULE), "handoffs", `${applicationId}.yaml`);
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

function loadApplicationRegistryFile(): {
  path: string;
  data: z.output<typeof permitApplicationRegistryFileSchema>;
} | null {
  const fromApp = loadAppDataFile("application-registry.yaml", permitApplicationRegistryFileSchema);
  if (fromApp) return fromApp;
  // 1-release compat: fall back to registry module application-registry
  return loadRegistryDataFile("application-registry.yaml", permitApplicationRegistryFileSchema);
}

export function saveApplicationRegistry(
  data: z.output<typeof permitApplicationRegistryFileSchema>
): string {
  const path = applicationRegistryPath();
  writeYamlFile(path, { ...data, as_of: data.as_of ?? currentDate() });
  return path;
}

function getApplication(applicationId: string): PermitApplicationEntry | null {
  const registry = loadApplicationRegistryFile();
  if (!registry) return null;
  return registry.data.applications.find((a) => a.id === applicationId) ?? null;
}

function updateApplicationEntry(
  applicationId: string,
  patch: Partial<PermitApplicationEntry>
): PermitApplicationEntry {
  const loaded = loadApplicationRegistryFile();
  if (!loaded) {
    console.error("application-registry.yaml not found");
    process.exit(1);
  }
  const idx = loaded.data.applications.findIndex((a) => a.id === applicationId);
  if (idx < 0) {
    console.error(`Application not found: ${applicationId}`);
    process.exit(1);
  }
  const updated = { ...loaded.data.applications[idx]!, ...patch };
  const applications = [...loaded.data.applications];
  applications[idx] = updated;
  saveApplicationRegistry({ ...loaded.data, applications });
  return updated;
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
  form: PermitFormEntry,
  phase?: string
): ChecklistResult {
  const merged = { ...draft.fields, ...draft.manual_overrides };
  const requiredMissing = form.required_fields.filter(
    (field) => !String(merged[field] ?? "").trim()
  );
  const blank_template_fields = blankFieldsForTemplate(draft, form);
  // required とテンプレ未記載を統合（提出可能 = どちらも空でない）
  const missing = [...new Set([...requiredMissing, ...blank_template_fields])].sort();
  const clarify_questions = buildClarifyQuestions({
    permitTypeId: draft.permit_type_id,
    blankFields: missing,
  });
  const procedure_steps = loadPermitConditionsForType(draft.permit_type_id, phase);
  const procedure_required_count = procedure_steps.filter((s) => s.severity === "required").length;
  return {
    missing,
    blank_template_fields,
    clarify_questions,
    ready_for_export: missing.length === 0,
    procedure_steps,
    procedure_required_count,
  };
}

export function runPermitAppProcedures(opts: {
  type?: string;
  application?: string;
  phase?: string;
  write?: boolean;
  json?: boolean;
}): void {
  let permitTypeId = opts.type;
  let phase = opts.phase;
  let applicationId = opts.application;

  if (applicationId) {
    const app = getApplication(applicationId);
    if (!app) {
      console.error(`Application not found: ${applicationId}`);
      process.exit(1);
    }
    permitTypeId = app.permit_type_id;
    phase = phase ?? app.phase ?? "obtain";
  }

  if (!permitTypeId) {
    console.error("--type または --application が必要です");
    process.exit(1);
  }

  const steps = loadPermitConditionsForType(permitTypeId, phase);
  const prereqs = loadCatalogCsv("permit-prerequisites.csv").filter(
    (r) => r.permit_type_id === permitTypeId
  );

  if (opts.json) {
    console.log(JSON.stringify({ permit_type_id: permitTypeId, phase, steps, prerequisites: prereqs }, null, 2));
    return;
  }

  console.log(`# 免許取得手続き — ${permitTypeId}${phase ? ` / ${phase}` : ""}\n`);
  if (prereqs.length) {
    console.log("## 前提許可");
    for (const p of prereqs) {
      console.log(`- [${p.severity}] ${p.prerequisite_type_id}${p.notes ? ` — ${p.notes}` : ""}`);
    }
    console.log("");
  }
  if (!steps.length) {
    console.log("（conditions 未定義）");
    return;
  }
  console.log("## 手続ステップ");
  for (const s of steps) {
    console.log(`- **${s.condition_id}** [${s.severity}] ${s.title_ja}`);
    console.log(`  根拠: ${s.legal_basis}`);
    if (s.evidence_hint) console.log(`  証跡: ${s.evidence_hint}`);
    if (s.notes) console.log(`  備考: ${s.notes}`);
  }

  if (opts.write && applicationId) {
    const outDir = docsRoot(applicationId);
    mkdirSync(outDir, { recursive: true });
    const lines = [
      `# 手続チェックリスト — ${applicationId}`,
      "",
      `種別: ${permitTypeId} · phase: ${phase ?? "obtain"}`,
      "",
      "## 前提",
      ...prereqs.map(
        (p) => `- [${p.severity}] ${p.prerequisite_type_id}${p.notes ? ` — ${p.notes}` : ""}`
      ),
      "",
      "## ステップ",
      ...steps.flatMap((s) => [
        `- [ ] **${s.title_ja}** (\`${s.condition_id}\`)`,
        `  - 根拠: ${s.legal_basis}`,
        ...(s.evidence_hint ? [`  - 証跡: ${s.evidence_hint}`] : []),
      ]),
      "",
    ];
    const mdPath = join(outDir, "procedures.md");
    writeTrackedFile(mdPath, lines.join("\n"));
    console.log(`\n✓ ${mdPath}`);
  }
}

function nextApplicationId(type: string, property?: string): string {
  const registry = loadApplicationRegistryFile();
  const existing = new Set(registry?.data.applications.map((a) => a.id) ?? []);
  const slug = type.replace(/^pt-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  const propPart = property ? `${property.replace(/^PROP-/, "P")}-` : "";
  let n = 1;
  let id = `APP-${propPart}${slug}-${String(n).padStart(3, "0")}`;
  while (existing.has(id)) {
    n += 1;
    id = `APP-${propPart}${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

/** 業モジュール不要 — CSV 全種別の書式カバー状況（単独取得可否） */
export function assessStandaloneCatalogCoverage(): {
  type_count: number;
  form_covered: number;
  missing_forms: string[];
  prerequisites: { permit_modules: string[]; business_modules: string[] };
} {
  const typeIds = [...listPermitTypeIdsFromCsv()].sort();
  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const covered = new Set<string>();
  if (formsCatalog) {
    for (const form of formsCatalog.data.forms) {
      for (const tid of form.permit_type_ids) covered.add(tid);
    }
  }
  const missing_forms = typeIds.filter((id) => !covered.has(id));
  return {
    type_count: typeIds.length,
    form_covered: typeIds.length - missing_forms.length,
    missing_forms,
    prerequisites: {
      permit_modules: [APP_MODULE, REGISTRY_MODULE],
      business_modules: [],
    },
  };
}

export function runPermitAppCatalogStatus(opts: { json?: boolean }): void {
  const status = assessStandaloneCatalogCoverage();
  if (opts.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log("# 国法級カタログ — 単独取得可否\n");
  console.log(
    `種別: ${status.type_count} · 書式カバー: ${status.form_covered}/${status.type_count}`
  );
  console.log(
    `前提モジュール: ${status.prerequisites.permit_modules.join(", ")}（業モジュール不要）`
  );
  console.log("");
  console.log("## 導線（業モジュール未インストール）");
  console.log("```");
  console.log("orgos operations permit-app create --type <pt-…> --write");
  console.log("orgos operations permit-app prepare --application APP-… --write");
  console.log("orgos operations permit-app checklist|draft|export-pdf|handoff|submit-mark|approve …");
  console.log("# 既取得:");
  console.log(
    "orgos operations permit-app intake attest --type <pt-…> --permit-number … --issued-on YYYY-MM-DD --evidence /path.pdf --write"
  );
  console.log("```");
  if (status.missing_forms.length) {
    console.log("\n## 書式未定義");
    for (const id of status.missing_forms) console.log(`- ${id}`);
    process.exitCode = 1;
  } else {
    console.log("\n✓ 全種別が forms-catalog でカバー — 事業モジュールなしで取得手続きを開始可能");
  }
}

export function runPermitAppCreate(opts: {
  type: string;
  property?: string;
  phase?: PermitApplicationPhase;
  notes?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const csvIds = listPermitTypeIdsFromCsv();
  if (!csvIds.has(opts.type)) {
    console.error(`Unknown permit type: ${opts.type} (not in permit-types.csv)`);
    process.exit(1);
  }

  // Optional YAML catalog cross-check (tenant may lag CSV)
  const typesCatalog = loadCatalogFile(CATALOG_FILES.types, permitTypesCatalogFileSchema);
  if (typesCatalog) {
    const known = typesCatalog.data.permit_types.some((t) => t.id === opts.type);
    if (!known) {
      console.error(
        `警告: ${opts.type} は CSV にあるが permit-types-catalog.yaml 未同期 — seed/CSV 正本を優先`
      );
    }
  }

  const id = nextApplicationId(opts.type, opts.property);
  const app: PermitApplicationEntry = {
    id,
    permit_type_id: opts.type,
    status: "preparing",
    phase: opts.phase ?? "obtain",
    property_id: opts.property as PermitApplicationEntry["property_id"],
    docs_root: `docs/permit-applications/${id}/`,
    notes: opts.notes,
  };

  if (opts.json) {
    console.log(JSON.stringify({ application: app }, null, 2));
    if (!opts.write) return;
  } else {
    console.log(`# 申請案件作成 — ${app.id}\n`);
    console.log(`種別: ${app.permit_type_id} · phase: ${app.phase} · status: ${app.status}`);
    if (app.property_id) console.log(`物件: ${app.property_id}`);
  }

  if (opts.write) {
    const loaded = loadApplicationRegistryFile();
    const data = loaded?.data ?? { as_of: currentDate(), applications: [] };
    const path = saveApplicationRegistry({
      ...data,
      applications: [...data.applications, app],
    });
    console.log(`\n✓ 保存: ${path}`);
    const evt = emitLicenseLifecycleEvent({
      lifecycle: "LicenseApplicationStarted",
      applicationId: app.id,
      permitTypeId: app.permit_type_id,
      propertyId: app.property_id,
      phase: app.phase,
    });
    if (evt) console.log(`✓ company-event: ${evt.id} (${evt.title})`);
    console.log(`次: \`operations permit-app prepare --application ${app.id} --write\``);
  } else if (!opts.json) {
    console.log("\n`--write` で data/permit-applications/application-registry.yaml に保存");
  }
}

export function runPermitApplicationPrepare(opts: {
  application: string;
  structureUse?: string;
  businessType?: string;
  licenseType?: string;
  siteManager?: string;
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
    console.error("forms-catalog.yaml or field-map.yaml missing (jp_permit_registry)");
    process.exit(1);
  }

  const form = findFormForPermitType(formsCatalog.data.forms, app.permit_type_id);
  if (!form) {
    console.error(`No form defined for permit type ${app.permit_type_id}`);
    process.exit(1);
  }

  const company = loadCompany();
  const property = app.property_id ? loadProperty(app.property_id) : undefined;
  const prevDraft = loadDraft(opts.application);
  const overrides: Record<string, string> = {
    ...(app.field_overrides ?? {}),
    ...(prevDraft?.manual_overrides ?? {}),
  };
  if (opts.structureUse) overrides.structure_use = opts.structureUse;
  if (opts.businessType) overrides.business_type = opts.businessType;
  if (opts.licenseType) overrides.license_type = opts.licenseType;
  if (opts.siteManager) overrides.site_manager_name = opts.siteManager;

  // Persist CLI overrides onto the application case for next prepare
  if (opts.write && Object.keys(overrides).length) {
    updateApplicationEntry(app.id, { field_overrides: overrides });
  }

  const appWithOverrides: PermitApplicationEntry = {
    ...app,
    field_overrides: overrides,
  };
  const ctx: PermitFieldContext = {
    company,
    property,
    application: appWithOverrides,
    overrides,
  };
  const fields = buildFieldsFromMap(fieldMap.data.mappings, ctx);
  // 物件未紐づけ案件は本店住所を事業所所在地のフォールバックにする
  if (!String(fields.site_address ?? "").trim() && company.address) {
    fields.site_address = company.address;
  }
  if (!String(fields.site_name ?? "").trim()) {
    fields.site_name = company.name;
  }
  // CLI / overrides を fields にも載せる（field-map 未同期テナント向け）
  for (const [k, v] of Object.entries(overrides)) {
    if (String(v ?? "").trim()) fields[k] = v;
  }

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
  draft.checklist = {
    last_run: currentDate(),
    missing: checklist.missing,
    ready_for_export: checklist.ready_for_export,
  };

  if (opts.json) {
    console.log(JSON.stringify({ draft, checklist }, null, 2));
    return;
  }

  console.log(`# 申請ドラフト準備 — ${app.id}\n`);
  console.log(`種別: ${app.permit_type_id} · 書式: ${form.name_ja}`);
  console.log(`自動入力: ${Object.keys(fields).length} フィールド`);
  if (checklist.missing.length) {
    console.log(`\n未充足（${checklist.missing.length}）: ${checklist.missing.join(", ")}`);
    if (checklist.clarify_questions.length) {
      console.log("\n確認質問:");
      for (const [i, q] of checklist.clarify_questions.entries()) {
        console.log(`  ${i + 1}. ${q}`);
      }
    }
  } else {
    console.log("\n必須項目: 充足");
  }

  if (opts.write) {
    const path = saveDraft(draft);
    console.log(`\n✓ 保存: ${path}`);
    console.log("次: `operations permit-app checklist` → `draft` → `export-pdf`");
  } else {
    console.log("\n`--write` で data/permit-applications/drafts/ に保存");
  }
}

export function runPermitApplicationShow(opts: { application: string; json?: boolean }): void {
  const draft = loadDraft(opts.application);
  if (!draft) {
    console.error(`Draft not found: ${opts.application} — run permit-app prepare --write first`);
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
  draft.checklist = {
    last_run: currentDate(),
    missing: result.missing,
    ready_for_export: result.ready_for_export,
  };
  if (opts.write) saveDraft(draft);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# チェックリスト — ${opts.application}\n`);
  if (result.ready_for_export) {
    console.log("✓ 必須項目充足 — export-pdf 可能（（未記載）なし）");
  } else {
    console.log("✗ 未充足フィールド（提出不可 · 確認質問へ）:");
    for (const m of result.missing) console.log(`  - ${m}`);
    if (result.clarify_questions.length) {
      console.log("\n## 確認質問（Agent はここで停めて人間に聞く）");
      for (const [i, q] of result.clarify_questions.entries()) {
        console.log(`${i + 1}. ${q}`);
      }
      console.log(
        "\n回答後: `prepare --business-type …` / field overrides → checklist → draft → export-pdf"
      );
    }
  }
  if (result.procedure_steps?.length) {
    console.log(`\n## 取得手続（catalog conditions · required ${result.procedure_required_count}）`);
    for (const s of result.procedure_steps) {
      console.log(`- [${s.severity}] ${s.title_ja}`);
    }
    console.log("\n詳細: `operations permit-app procedures --application <id> --write`");
  }
  if (!result.ready_for_export) process.exitCode = 1;
}

export function runPermitAppClarify(opts: { application: string; json?: boolean }): void {
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
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`# 提出準備 — 確認質問 · ${opts.application}\n`);
  if (result.ready_for_export) {
    console.log("✓ 未記載なし — draft / export-pdf に進めます");
    return;
  }
  console.log("次を人間に確認してから再 prepare してください（空欄のまま PDF 提出不可）:\n");
  for (const [i, q] of result.clarify_questions.entries()) {
    console.log(`${i + 1}. ${q}`);
  }
  console.log(`\n空欄: ${result.missing.join(", ")}`);
  process.exitCode = 1;
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
  const checklist = runPermitApplicationChecklistOnDraft(draft, form);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          md_path: join(docsRoot(draft.application_id), "application.md"),
          md,
          checklist,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(md);
  if (!checklist.ready_for_export) {
    console.error("\n⚠ （未記載）あり — 提出可能水準ではありません。確認質問:");
    for (const [i, q] of checklist.clarify_questions.entries()) {
      console.error(`  ${i + 1}. ${q}`);
    }
    console.error("  → `operations permit-app clarify --application " + opts.application + "`");
    process.exitCode = 1;
  }
  if (opts.write) {
    const outDir = docsRoot(draft.application_id);
    mkdirSync(outDir, { recursive: true });
    const mdPath = join(outDir, "application.md");
    writeTrackedFile(mdPath, md);
    draft.export = { ...draft.export, md_path: mdPath.replace(resolveTenantPath(""), "").replace(/^\//, "") };
    draft.checklist = {
      last_run: currentDate(),
      missing: checklist.missing,
      ready_for_export: checklist.ready_for_export,
    };
    saveDraft(draft);
    console.error(`\n✓ MD: ${mdPath}`);
  }
}

function writeMdExport(
  draft: PermitApplicationDraftFile,
  form: PermitFormEntry,
  vars: Record<string, string>,
  opts: { write?: boolean }
): void {
  const md = renderPermitTemplate(loadTemplate(form.template_md), vars);
  if (!opts.write) {
    console.log(md);
    console.error("\nこの書式は MD 出力のみ。`permit-app draft --write` を使用");
    return;
  }
  const outDir = join(getDocsDir(), "io", "outbox", "submissions");
  mkdirSync(outDir, { recursive: true });
  const mdPath = join(outDir, `${draft.application_id}-application.md`);
  writeTrackedFile(mdPath, md);
  console.log(`✓ 提出用 MD: ${mdPath}`);
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
    console.error("Checklist incomplete（（未記載）または必須欠落）. Fix fields or use --force");
    console.error(`Missing: ${checklist.missing.join(", ")}`);
    if (checklist.clarify_questions.length) {
      console.error("\n確認質問:");
      for (const [i, q] of checklist.clarify_questions.entries()) {
        console.error(`  ${i + 1}. ${q}`);
      }
    }
    console.error(`\n→ operations permit-app clarify --application ${opts.application}`);
    process.exit(1);
  }

  const permitTypeName =
    typesCatalog?.data.permit_types.find((t) => t.id === draft.permit_type_id)?.name_ja ??
    draft.permit_type_id;
  const vars = mergeTemplateVars(draft, form, permitTypeName);

  if (form.output_format === "md") {
    writeMdExport(draft, form, vars, opts);
    return;
  }

  if (!form.template_tex) {
    if (!opts.force) {
      console.error(
        "template_tex is required for tex/pdf output. Add template_tex to forms-catalog, or use --force for legacy MD fallback."
      );
      process.exit(1);
    }
    writeMdExport(draft, form, vars, opts);
    return;
  }

  const engine = detectLatexEngine();
  if (!engine) {
    console.error(
      "LaTeX (xelatex) not installed. Install MacTeX / TeX Live, or use `permit-app draft --write` for MD only."
    );
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

  try {
    registerOutboxItem({
      from: finalPdf,
      category: "submissions",
      copy: false,
      relatedId: draft.application_id,
      purpose: "print",
      source: "cli",
    });
  } catch {
    // document-io may be unavailable in minimal fixtures
  }

  if (opts.json) {
    console.log(JSON.stringify({ pdf: finalPdf, engine: result.engine }, null, 2));
    return;
  }

  console.log(`✓ PDF: ${finalPdf}`);
  console.log(`  TeX: ${texPath} · engine: ${result.engine}`);
  if (form.official_form_notes) console.log(`  注意: ${form.official_form_notes}`);
}

export function runPermitAppHandoff(opts: {
  application: string;
  contact?: string;
  authority?: string;
  channel?: "counter" | "mail" | "online_manual";
  notes?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const app = getApplication(opts.application);
  if (!app) {
    console.error(`Application not found: ${opts.application}`);
    process.exit(1);
  }

  const formsCatalog = loadCatalogFile(CATALOG_FILES.forms, permitFormsCatalogFileSchema);
  const form = formsCatalog
    ? findFormForPermitType(formsCatalog.data.forms, app.permit_type_id)
    : undefined;
  const authority =
    opts.authority ??
    form?.submission?.authority_label_ja ??
    "（管轄行政機関 — 要確認）";

  const handoff: PermitHandoffEntry = {
    id: `HO-${app.id}-${currentDate().replace(/-/g, "")}`,
    application_id: app.id,
    contact_id: opts.contact,
    authority_label_ja: authority,
    channel: opts.channel ?? form?.submission?.channel ?? "counter",
    sent_on: currentDate(),
    notes: opts.notes,
  };

  if (opts.json) {
    console.log(JSON.stringify({ handoff }, null, 2));
  } else {
    console.log(`# Handoff — ${app.id}\n`);
    console.log(`id: ${handoff.id}`);
    console.log(`authority: ${handoff.authority_label_ja}`);
    console.log(`channel: ${handoff.channel}`);
    if (handoff.contact_id) console.log(`contact: ${handoff.contact_id}`);
  }

  if (opts.write) {
    const path = handoffPath(app.id);
    mkdirSync(join(path, ".."), { recursive: true });
    const existing = existsSync(path)
      ? permitHandoffFileSchema.parse(YAML.parse(readFileSync(path, "utf-8")))
      : { as_of: currentDate(), handoffs: [] };
    const file = {
      as_of: currentDate(),
      handoffs: [...existing.handoffs.filter((h) => h.id !== handoff.id), handoff],
    };
    writeYamlFile(path, file);
    updateApplicationEntry(app.id, { handoff_id: handoff.id });
    console.log(`\n✓ 保存: ${path}`);
  } else if (!opts.json) {
    console.log("\n`--write` で data/permit-applications/handoffs/ に保存");
  }
}

export function runPermitAppSubmitMark(opts: {
  application: string;
  write?: boolean;
  json?: boolean;
}): void {
  const app = getApplication(opts.application);
  if (!app) {
    console.error(`Application not found: ${opts.application}`);
    process.exit(1);
  }
  const today = currentDate();
  if (opts.json) {
    console.log(JSON.stringify({ id: app.id, status: "submitted", submitted_on: today }, null, 2));
  } else {
    console.log(`# 提出マーク — ${app.id} → submitted（${today}）`);
  }
  if (opts.write) {
    updateApplicationEntry(app.id, { status: "submitted", submitted_on: today });
    console.log(`✓ application-registry 更新`);
    const evt = emitLicenseLifecycleEvent({
      lifecycle: "ApplicationSubmitted",
      applicationId: app.id,
      permitTypeId: app.permit_type_id,
      propertyId: app.property_id,
      phase: app.phase,
    });
    if (evt) console.log(`✓ company-event: ${evt.id}`);
  } else if (!opts.json) {
    console.log("`--write` で status=submitted · submitted_on を保存");
  }
}

function nextPermitId(type: string, existing: PermitInstanceEntry[]): string {
  const ids = new Set(existing.map((p) => p.id));
  const slug = type.replace(/^pt-/, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  let n = 1;
  let id = `PER-${slug}-${String(n).padStart(3, "0")}`;
  while (ids.has(id)) {
    n += 1;
    id = `PER-${slug}-${String(n).padStart(3, "0")}`;
  }
  return id;
}

function ensureObligationInstances(permit: PermitInstanceEntry): number {
  const obligations = loadCatalogFile(CATALOG_FILES.obligations, permitObligationsCatalogFileSchema);
  if (!obligations) return 0;

  const matching = obligations.data.obligations.filter((o) =>
    o.permit_type_ids.includes(permit.permit_type_id)
  );
  if (!matching.length) return 0;

  const instPath = join(getModuleDataDir(REGISTRY_MODULE), "obligation-instances.yaml");
  const loaded = loadRegistryDataFile(
    "obligation-instances.yaml",
    permitObligationInstancesFileSchema
  );
  const file = loaded?.data ?? { as_of: currentDate(), instances: [] };
  const existingKeys = new Set(file.instances.map((i) => `${i.permit_id}::${i.obligation_id}`));
  let added = 0;
  const instances = [...file.instances];
  for (const ob of matching) {
    const key = `${permit.id}::${ob.id}`;
    if (existingKeys.has(key)) continue;
    const short = ob.id.replace(/^OBL-/, "");
    instances.push({
      id: `OBLINST-${permit.id}-${short}`.slice(0, 80),
      obligation_id: ob.id,
      permit_id: permit.id,
      status: "open",
      notes: `generated on approve ${currentDate()}`,
    });
    existingKeys.add(key);
    added += 1;
  }
  if (added > 0) {
    writeYamlFile(instPath, { as_of: currentDate(), instances });
  }
  return added;
}

export function runPermitAppApprove(opts: {
  application: string;
  permitNumber: string;
  issuedOn: string;
  write?: boolean;
  json?: boolean;
}): void {
  const app = getApplication(opts.application);
  if (!app) {
    console.error(`Application not found: ${opts.application}`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.issuedOn)) {
    console.error("--issued-on must be YYYY-MM-DD");
    process.exit(1);
  }

  const regLoaded = loadRegistryDataFile("permit-registry.yaml", permitRegistryFileSchema);
  const registry = regLoaded?.data ?? { as_of: currentDate(), permits: [] as PermitInstanceEntry[] };
  const permits = [...registry.permits];

  let permit: PermitInstanceEntry;
  const existingIdx = app.target_permit_id
    ? permits.findIndex((p) => p.id === app.target_permit_id)
    : permits.findIndex((p) => p.application_id === app.id);

  if (existingIdx >= 0) {
    permit = {
      ...permits[existingIdx]!,
      status: "active",
      permit_number: opts.permitNumber,
      issued_on: opts.issuedOn,
      application_id: app.id,
      permit_type_id: app.permit_type_id,
      property_id: app.property_id ?? permits[existingIdx]!.property_id,
    };
    permits[existingIdx] = permit;
  } else {
    permit = {
      id: nextPermitId(app.permit_type_id, permits),
      permit_type_id: app.permit_type_id,
      status: "active",
      permit_number: opts.permitNumber,
      issued_on: opts.issuedOn,
      property_id: app.property_id,
      application_id: app.id,
    };
    permits.push(permit);
  }

  if (opts.json) {
    console.log(JSON.stringify({ application: app.id, permit }, null, 2));
  } else {
    console.log(`# 承認 → PER — ${app.id}\n`);
    console.log(`permit: ${permit.id} · number: ${opts.permitNumber} · issued: ${opts.issuedOn}`);
  }

  if (opts.write) {
    const regPath = join(getModuleDataDir(REGISTRY_MODULE), "permit-registry.yaml");
    writeYamlFile(regPath, { as_of: currentDate(), permits });
    updateApplicationEntry(app.id, {
      status: "approved",
      target_permit_id: permit.id,
    });
    const added = ensureObligationInstances(permit);
    console.log(`✓ permit-registry upsert: ${permit.id}`);
    console.log(`✓ application status=approved · target_permit_id=${permit.id}`);
    if (added) console.log(`✓ obligation instances created: ${added}`);
    const lifecycle =
      app.phase === "renew"
        ? "LicenseRenewed"
        : app.phase === "change"
          ? "LicenseModified"
          : "LicenseGranted";
    const evt = emitLicenseLifecycleEvent({
      lifecycle,
      applicationId: app.id,
      permitTypeId: app.permit_type_id,
      permitId: permit.id,
      propertyId: app.property_id,
      phase: app.phase,
      notes: `permit_number=${opts.permitNumber} · issued_on=${opts.issuedOn}`,
    });
    if (evt) console.log(`✓ company-event: ${evt.id} (${lifecycle})`);
  } else if (!opts.json) {
    console.log("\n`--write` で PER active · APP approved · 義務インスタンス生成");
  }
}
