import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  trademarkFieldMapFileSchema,
  trademarkGoodsServicesFileSchema,
  trademarkMarksFileSchema,
  trademarkRegistryFileSchema,
  trademarkSourcesFileSchema,
  type TrademarkApplication,
  type TrademarkGoodsServicesCatalog,
  type TrademarkMark,
} from "../../../../../../schemas/jp-trademark.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";

export const MODULE_ID = "jp_trademark_application";

function loadTrademarkDataFile<S extends z.ZodTypeAny>(
  filename: string,
  schema: S
): { data: z.output<S>; path: string } | null {
  const loaded = loadModuleDataFile(MODULE_ID, filename, schema);
  if (!loaded) return null;
  return { data: schema.parse(loaded.data), path: loaded.path };
}

const MARK_TYPE_LABELS: Record<string, string> = {
  standard_characters: "標準文字",
  figurative: "図形商標",
  sound: "音商標",
  color: "色彩のみ",
  motion: "動き商標",
  hologram: "ホログラム商標",
  position: "位置商標",
  other: "その他",
};

const FILING_METHOD_LABELS: Record<string, string> = {
  online: "オンライン出願",
  paper: "書面出願",
};

interface CompanySnapshot {
  name: string;
  corporate_number?: string;
  address?: string;
}

function loadCompanySnapshot(): CompanySnapshot {
  const company = loadCompany();
  return {
    name: company.name,
    corporate_number: company.corporate_number,
    address: company.address,
  };
}

function toReiwaDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const reiwa = y - 2018;
  return `令和${reiwa}年${m}月${d}日`;
}

function resolveTemplatePath(templateRel: string): string | null {
  const candidates = [
    join(getModuleDataDir(MODULE_ID), templateRel),
    join(getModuleDataDir(MODULE_ID), templateRel.replace(/\.example$/, "")),
    join(getModuleSeedDir(MODULE_ID), templateRel),
    join(getModuleSeedDir(MODULE_ID), templateRel.endsWith(".example") ? templateRel : `${templateRel}.example`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function loadTemplate(templateRel: string): string {
  const path = resolveTemplatePath(templateRel);
  if (!path) {
    throw new Error(`Template not found: ${templateRel}`);
  }
  return readFileSync(path, "utf-8");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function resolveFieldValue(source: string, snap: CompanySnapshot): string {
  const parts = source.split(".");
  if (parts[0] === "company") {
    const key = parts[1];
    const val = snap[key as keyof CompanySnapshot];
    return val != null ? String(val) : "";
  }
  return "";
}

function buildGoodsServicesBlock(catalog: TrademarkGoodsServicesCatalog): string {
  const lines: string[] = [];
  for (const cls of catalog.classes) {
    const heading = cls.heading ?? `第${cls.class_no}類`;
    lines.push(`【${heading.replace(/^【?|】?$/g, "")}】`);
    for (const item of cls.items) {
      lines.push(`　${item}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function buildMarkBlock(mark: TrademarkMark): string {
  if (mark.type === "standard_characters") {
    return [
      "標準文字する商標",
      "",
      mark.representation.trim(),
      "",
      "（書体は問いません）",
    ].join("\n");
  }
  const lines = [mark.representation.trim()];
  if (mark.specimen_note) lines.push("", mark.specimen_note);
  return lines.join("\n");
}

function buildAgentBlock(app: TrademarkApplication): string {
  if (!app.agent_name) {
    return "【代理人】\n\n（省略 · 直接出願）";
  }
  const reg = app.agent_registration_no ? `\n【登録番号】　${app.agent_registration_no}` : "";
  return `【代理人】\n\n【氏名又は名称】　${app.agent_name}${reg}`;
}

function resolveApplication(applicationId: string): {
  app: TrademarkApplication;
  mark: TrademarkMark;
  catalog: TrademarkGoodsServicesCatalog;
} | null {
  const registry = loadTrademarkDataFile("trademark-registry.yaml", trademarkRegistryFileSchema);
  if (!registry) return null;
  const app = registry.data.applications.find((a) => a.id === applicationId);
  if (!app) return null;

  const marks = loadTrademarkDataFile("marks.yaml", trademarkMarksFileSchema);
  const gs = loadTrademarkDataFile("goods-services.yaml", trademarkGoodsServicesFileSchema);
  if (!marks || !gs) return null;

  const mark = marks.data.marks.find((m) => m.id === app.mark_id);
  const catalog = gs.data.catalogs.find((c) => c.id === app.goods_services_id);
  if (!mark || !catalog) return null;

  return { app, mark, catalog };
}

function loadSources() {
  return loadTrademarkDataFile("sources.yaml", trademarkSourcesFileSchema);
}

function defaultSourceUrls(): { jpo: string; inpit: string; jplatpat: string } {
  const sources = loadSources();
  const byId = new Map(sources?.data.sources.map((s) => [s.id, s.url]) ?? []);
  return {
    jpo: byId.get("jpo-trademark-basics") ?? "https://www.jpo.go.jp/system/basic/trademark/index.html",
    inpit: byId.get("inpit-writing-guide-202601") ?? "https://faq.inpit.go.jp/FAQ/trademark202601.pdf",
    jplatpat: byId.get("j-platpat-goods-search") ?? "https://www.j-platpat.inpit.go.jp/",
  };
}

function buildDraftVars(
  app: TrademarkApplication,
  mark: TrademarkMark,
  catalog: TrademarkGoodsServicesCatalog,
  snap: CompanySnapshot
): Record<string, string> {
  const urls = defaultSourceUrls();
  const filingDate = app.filing_date ?? currentDate();
  const fieldMap = loadTrademarkDataFile("field-map.yaml", trademarkFieldMapFileSchema);
  let applicantName = snap.name;
  let applicantAddress = snap.address ?? "";
  for (const m of fieldMap?.data.mappings ?? []) {
    const val = resolveFieldValue(m.source, snap);
    if (m.form_field.includes("氏名又は名称") && val) applicantName = val;
    if (m.form_field.includes("住所") && val) applicantAddress = val;
  }

  return {
    application_id: app.id,
    mark_id: mark.id,
    goods_services_id: catalog.id,
    generated_iso: new Date().toISOString(),
    reference_number: app.reference_number?.trim() || "（任意 · 未設定）",
    filing_date_reiwa: toReiwaDate(filingDate),
    mark_block: buildMarkBlock(mark),
    goods_services_block: buildGoodsServicesBlock(catalog),
    applicant_name: applicantName,
    applicant_address: applicantAddress || "（要記載 · company.yaml を確認）",
    agent_block: buildAgentBlock(app),
    filing_method_label: FILING_METHOD_LABELS[app.filing_method] ?? app.filing_method,
    mark_type_label: MARK_TYPE_LABELS[mark.type] ?? mark.type,
    j_platpat_goods_url: catalog.j_platpat_goods_search_url ?? urls.jplatpat,
    source_jpo_basics_url: urls.jpo,
    source_inpit_guide_url: urls.inpit,
    specimen_instruction: mark.specimen_note ?? mark.representation.trim(),
    specimen_path_note: mark.specimen_path ?? "（records/trademark/ に配置）",
    agent_name: app.agent_name ?? "（要記載）",
    agent_registration_no: app.agent_registration_no ?? "（要記載）",
  };
}

export function runJpTrademarkShow(opts: { json?: boolean }): void {
  const registry = loadTrademarkDataFile("trademark-registry.yaml", trademarkRegistryFileSchema);
  const marks = loadTrademarkDataFile("marks.yaml", trademarkMarksFileSchema);
  const gs = loadTrademarkDataFile("goods-services.yaml", trademarkGoodsServicesFileSchema);
  const sources = loadSources();
  const jurisdiction = getResolvedJurisdiction();

  const summary = {
    jurisdiction: jurisdiction.code,
    applications: registry?.data.applications.length ?? 0,
    marks: marks?.data.marks.length ?? 0,
    goods_services_catalogs: gs?.data.catalogs.length ?? 0,
    official_sources: sources?.data.sources.length ?? 0,
    forms: sources?.data.forms.length ?? 0,
    applications_list: registry?.data.applications ?? [],
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`# jp_trademark_application\n`);
  console.log(`法域: ${jurisdiction.code} · 案件 ${summary.applications} · 商標 ${summary.marks}\n`);
  if (sources?.data.sources.length) {
    console.log("## 公表資料\n");
    for (const s of sources.data.sources) {
      console.log(`- **${s.title}** — ${s.url}`);
    }
    console.log("");
  }
  if (registry?.data.applications.length) {
    console.log("## 出願案件\n");
    for (const a of registry.data.applications) {
      console.log(`- \`${a.id}\` · mark \`${a.mark_id}\` · ${a.status} · ${a.filing_method}`);
    }
  }
}

export function runJpTrademarkValidate(): void {
  const errors: string[] = [];
  const registry = loadTrademarkDataFile("trademark-registry.yaml", trademarkRegistryFileSchema);
  const marks = loadTrademarkDataFile("marks.yaml", trademarkMarksFileSchema);
  const gs = loadTrademarkDataFile("goods-services.yaml", trademarkGoodsServicesFileSchema);
  const fieldMap = loadTrademarkDataFile("field-map.yaml", trademarkFieldMapFileSchema);
  const sources = loadSources();

  if (!registry) errors.push("trademark-registry.yaml missing");
  if (!marks) errors.push("marks.yaml missing");
  if (!gs) errors.push("goods-services.yaml missing");
  if (!fieldMap) errors.push("field-map.yaml missing");
  if (!sources) errors.push("sources.yaml missing");

  if (registry && marks && gs) {
    const markIds = new Set(marks.data.marks.map((m) => m.id));
    const catalogIds = new Set(gs.data.catalogs.map((c) => c.id));
    for (const app of registry.data.applications) {
      if (!markIds.has(app.mark_id)) errors.push(`${app.id}: unknown mark_id ${app.mark_id}`);
      if (!catalogIds.has(app.goods_services_id)) {
        errors.push(`${app.id}: unknown goods_services_id ${app.goods_services_id}`);
      }
    }
    for (const form of sources?.data.forms ?? []) {
      if (!resolveTemplatePath(form.template)) {
        errors.push(`form ${form.id}: template missing (${form.template})`);
      }
    }
  }

  if (errors.length) {
    console.error("✗ jp_trademark_application:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("✓ jp_trademark_application — trademark data OK");
}

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function runJpTrademarkChecklist(opts: { application: string; json?: boolean }): void {
  const resolved = resolveApplication(opts.application);
  if (!resolved) {
    console.error(`Application ${opts.application} not found`);
    process.exit(1);
  }
  const { app, mark, catalog } = resolved;
  const snap = loadCompanySnapshot();
  const jurisdiction = getResolvedJurisdiction();
  const checks: ChecklistItem[] = [];

  checks.push({
    id: "req-jp",
    label: "日本法域テナントであること",
    ok: jurisdiction.code === "JP",
    detail: jurisdiction.code === "JP" ? "JP" : `current: ${jurisdiction.code}`,
  });
  checks.push({
    id: "applicant-name",
    label: "出願人名称が company SoT から取得できる",
    ok: Boolean(snap.name),
    detail: snap.name || "missing",
  });
  checks.push({
    id: "applicant-address",
    label: "出願人住所が記載可能",
    ok: Boolean(snap.address),
    detail: snap.address ? "OK" : "company.address を設定",
  });
  checks.push({
    id: "goods-services",
    label: "指定商品・役務が1類以上",
    ok: catalog.classes.length > 0 && catalog.classes.every((c) => c.items.length > 0),
    detail: `${catalog.classes.length} classes`,
  });
  checks.push({
    id: "mark-representation",
    label: "商標表示が定義されている",
    ok: Boolean(mark.representation.trim()),
    detail: mark.label,
  });
  const needsSpecimen = mark.type !== "standard_characters";
  checks.push({
    id: "specimen-if-needed",
    label: needsSpecimen ? "図形等 — 商標見本パスまたは説明" : "標準文字 — 見本不要",
    ok: !needsSpecimen || Boolean(mark.specimen_path || mark.specimen_note),
    detail: mark.specimen_path ?? mark.specimen_note ?? "—",
  });
  checks.push({
    id: "prior-search",
    label: "J-PlatPat 先行標章調査（人間確認）",
    ok: app.status !== "draft" || Boolean(mark.j_platpat_search_hint),
    detail: mark.j_platpat_search_hint ?? "marks.yaml に調査メモを推奨",
  });

  const passed = checks.every((c) => c.ok);
  const result = { application_id: app.id, passed, checks };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`# Checklist — ${app.id}\n`);
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.label} — ${c.detail}`);
  }
  console.log(`\n${passed ? "PASS" : "要対応あり"} · draft 前に INPIT 書き方ガイドを確認`);
}

export function runJpTrademarkDraft(opts: {
  application: string;
  write?: boolean;
  json?: boolean;
}): void {
  const resolved = resolveApplication(opts.application);
  if (!resolved) {
    console.error(`Application ${opts.application} not found`);
    process.exit(1);
  }
  const { app, mark, catalog } = resolved;
  const snap = loadCompanySnapshot();
  const vars = buildDraftVars(app, mark, catalog, snap);
  const sources = loadSources();
  const mainForm = sources?.data.forms.find((f) => f.id === "form-trademark-application");
  const templateRel = mainForm?.template ?? "templates/shohyo-toroku-gen.md.example";
  const content = renderTemplate(loadTemplate(templateRel), vars);

  const outputs: Array<{ name: string; path: string; content: string }> = [
    { name: "shohyo-toroku-gen.md", path: "", content },
  ];

  if (mark.type !== "standard_characters") {
    const specForm = sources?.data.forms.find((f) => f.id === "form-specimen-instruction");
    if (specForm) {
      outputs.push({
        name: "shohyo-kenben-shiji.md",
        path: "",
        content: renderTemplate(loadTemplate(specForm.template), vars),
      });
    }
  }

  if (app.agent_name) {
    const poaForm = sources?.data.forms.find((f) => f.id === "form-power-of-attorney");
    if (poaForm) {
      outputs.push({
        name: "dairi-ininjo.md",
        path: "",
        content: renderTemplate(loadTemplate(poaForm.template), vars),
      });
    }
  }

  const docsRoot = app.docs_root ?? `docs/trademark/${app.id}`;
  const absDocsRoot = join(getDocsDir(), docsRoot.replace(/^docs\//, ""));

  if (opts.write) {
    for (const out of outputs) {
      out.path = writeTrackedFile(join(absDocsRoot, out.name), out.content);
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          application_id: app.id,
          mark_id: mark.id,
          applicant_name: vars.applicant_name,
          classes: catalog.classes.map((c) => c.class_no),
          written: opts.write ?? false,
          outputs: outputs.map((o) => ({ name: o.name, path: o.path || join(docsRoot, o.name) })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Trademark draft — ${app.id}\n`);
  console.log(`商標: ${mark.label} · 類: ${catalog.classes.map((c) => c.class_no).join(", ")}\n`);
  if (opts.write) {
    for (const out of outputs) {
      console.log(`✓ wrote ${out.path}`);
    }
  } else {
    console.log(content);
    console.log("\n---");
    console.log("`--write` で docs/trademark/ に保存");
  }
}
