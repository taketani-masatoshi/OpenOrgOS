import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  corporateRegistrationCaseRegistryFileSchema,
  corporateRegistrationFormsFileSchema,
  corporateRegistrationProceduresFileSchema,
  type CorporateRegistrationCase,
  type CorporateRegistrationForm,
  type CorporateRegistrationProcedure,
} from "../../../../../../schemas/jp-corporate-registration.js";
import { loadCompany } from "../../../../../../src/lib/data.js";
import { getResolvedJurisdiction } from "../../../../../../src/lib/jurisdiction.js";
import {
  getModuleDataDir,
  loadModuleDataFile,
} from "../../../../../../src/lib/module-business-data.js";
import { getModuleSeedDir } from "../../../../../../src/lib/modules.js";
import { currentDate, getDocsDir, writeTrackedFile } from "../../../../../../src/lib/utils.js";
import {
  buildJapaneseLatexFontSetup,
  detectLatexEngine,
  writeTexAndCompile,
} from "../../../../../../src/lib/latex-compile.js";
import {
  findCompanyEventById,
  registerArtifactFiles,
} from "../../../../../../src/lib/company-events.js";

export const MODULE_ID = "jp_corporate_registration";

const CATEGORY_LABELS: Record<string, string> = {
  establishment: "設立",
  change: "変更",
  corporate_reorg: "組織再編",
  termination: "解散・清算",
};

const RESOLUTION_BODY_LABELS: Record<string, string> = {
  board: "取締役会",
  shareholders: "株主総会",
};

const FORM_OUTPUT_NAMES: Record<string, string> = {
  "form-teikan-kk": "teikan-kk.md",
  "form-sosen-gijiroku": "sosen-gijiroku.md",
  "form-yakuin-sennin-ketsugi": "yakuin-sennin-ketsugi.md",
  "form-yakuin-henko-ketsugi": "yakuin-henko-ketsugi.md",
  "form-shussho-dojisho": "shussho-dojisho.md",
  "form-inkan-todoke": "inkan-todoke.md",
  "form-touki-shinseisho": "touki-shinseisho.md",
  "form-honsha-iten-ketsugi": "honsha-iten-ketsugi.md",
  "form-shiten-setchi-ketsugi": "shiten-setchi-ketsugi.md",
  "form-shiten-haishi-ketsugi": "shiten-haishi-ketsugi.md",
  "form-kikan-henko-ketsugi": "kikan-henko-ketsugi.md",
  "form-teikan-kaitei": "teikan-kaitei.md",
  "form-shogo-henko-ketsugi": "shogo-henko-ketsugi.md",
  "form-mokuteki-henko-ketsugi": "mokuteki-henko-ketsugi.md",
  "form-shihon-henko-ketsugi": "shihon-henko-ketsugi.md",
  "form-kabushiki-joto-ketsugi": "kabushiki-joto-ketsugi.md",
  "form-gappei-keikaku": "gappei-keikaku.md",
  "form-gappei-ketsugi": "gappei-ketsugi.md",
  "form-bunkatsu-keikaku": "bunkatsu-keikaku.md",
  "form-bunkatsu-ketsugi": "bunkatsu-ketsugi.md",
  "form-kaisan-ketsugi": "kaisan-ketsugi.md",
  "form-seisan-ketsuryo-ketsugi": "seisan-ketsuryo-ketsugi.md",
};

interface CompanySnapshot {
  name: string;
  corporate_number?: string;
  address?: string;
  representative?: string;
  directors?: Array<{ name: string; role?: string }>;
  business_description?: string;
}

function loadCompanySnapshot(): CompanySnapshot {
  const company = loadCompany();
  return {
    name: company.name,
    corporate_number: company.corporate_number,
    address: company.address,
    representative: company.representative,
    directors: company.directors,
    business_description: company.business_description,
  };
}

function splitBusinessPurposes(desc?: string): string[] {
  if (!desc?.trim()) return ["（目的 — company.business_description から転記）"];
  return desc
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("Web:") && !l.startsWith("旧"))
    .slice(0, 6);
}

function defaultPerson(snap: CompanySnapshot, role = "代表取締役") {
  const fromCompany = snap.directors?.find((d) => d.role?.includes("代表"))?.name;
  const name =
    fromCompany ?? snap.representative?.split(/[、,]/)[0]?.trim() ?? "（代表者名 — 要記載）";
  return { name, role, address: snap.address ?? "（要記載）" };
}

/** Fill missing case blocks from company SoT — enables 簡略雛形 generation for any procedure */
export function enrichCaseWithDefaults(
  caseEntry: CorporateRegistrationCase,
  snap: CompanySnapshot,
  procedure: CorporateRegistrationProcedure
): CorporateRegistrationCase {
  const filing = caseEntry.filing_date;
  const rep = defaultPerson(snap);
  const directors = snap.directors?.length ? snap.directors : [rep];
  const enriched: CorporateRegistrationCase = { ...caseEntry, simplified: caseEntry.simplified ?? true };

  switch (procedure.id) {
    case "incorporation":
      if (!enriched.incorporation) {
        enriched.incorporation = {
          company_name: snap.name.includes("株式会社") ? snap.name : `株式会社${snap.name}`,
          capital_yen: 1_000_000,
          head_office: snap.address ?? "（本店所在地 — 要記載）",
          purposes: splitBusinessPurposes(snap.business_description),
          promoters: [{ ...rep, shares: 100 }],
          directors: directors.map((d) => ({ name: d.name, role: d.role, address: snap.address })),
          has_board: true,
          fiscal_year_end: "1月31日",
        };
      }
      break;
    case "trade_name_change":
      if (!enriched.trade_name_change) {
        enriched.trade_name_change = {
          resolution_date: filing,
          old_name: snap.name,
          new_name: `${snap.name}（新商号 — 要確定）`,
        };
      }
      break;
    case "head_office_relocation_same_bureau":
    case "head_office_relocation_cross_bureau":
      if (!enriched.head_office_change) {
        enriched.head_office_change = {
          resolution_date: filing,
          effective_date: filing,
          resolution_body: "board",
          old_address: snap.address ?? "（現本店 — 要記載）",
          new_address: "（移転先本店 — 要記載）",
          cross_bureau: procedure.id.includes("cross"),
        };
      } else {
        const hoc = enriched.head_office_change;
        enriched.head_office_change = {
          ...hoc,
          resolution_body: hoc.resolution_body ?? "board",
          effective_date: hoc.effective_date ?? hoc.resolution_date,
          cross_bureau: inferHeadOfficeCrossBureau(
            hoc.old_address,
            hoc.new_address,
            hoc.cross_bureau
          ),
        };
      }
      break;
    case "officer_appointment_resignation":
    case "representative_director_change":
    case "auditor_appointment":
      if (!enriched.officer_change) {
        enriched.officer_change = {
          resolution_date: filing,
          resolution_body: "shareholders",
          resigning: [],
          appointing: directors.map((d) => ({
            name: d.name,
            role: d.role ?? "取締役",
            address: snap.address,
          })),
        };
      }
      break;
    case "purpose_change":
      if (!enriched.purpose_change) {
        enriched.purpose_change = {
          resolution_date: filing,
          old_purposes: [],
          new_purposes: splitBusinessPurposes(snap.business_description),
        };
      }
      break;
    case "capital_increase":
    case "capital_decrease":
      if (!enriched.capital_change) {
        enriched.capital_change = {
          resolution_date: filing,
          old_capital_yen: 1_000_000,
          new_capital_yen: procedure.id === "capital_increase" ? 8_500_000 : 500_000,
          method: procedure.id === "capital_increase" ? "cash" : "surplus",
        };
      }
      break;
    case "branch_establishment":
    case "branch_abolition":
      if (!enriched.branch_change) {
        enriched.branch_change = {
          resolution_date: filing,
          branch_name: "○○支店",
          branch_address: "（支店所在地 — 要記載）",
          action: procedure.id === "branch_abolition" ? "abolish" : "establish",
        };
      }
      break;
    case "merger":
    case "company_split":
      if (!enriched.corporate_reorg) {
        enriched.corporate_reorg = {
          resolution_date: filing,
          reorg_type: procedure.id === "merger" ? "merger" : "split",
          counterparty_name: "株式会社相手方（要確定）",
          effective_date: filing,
          surviving_entity: snap.name,
        };
      }
      break;
    case "dissolution":
      if (!enriched.dissolution) {
        enriched.dissolution = {
          resolution_date: filing,
          resolution_body: "shareholders",
          liquidator: { ...rep, role: "清算人" },
          reason: "株主総会の決議による解散",
        };
      }
      break;
    case "liquidation_completion":
      if (!enriched.liquidation_completion) {
        enriched.liquidation_completion = {
          resolution_date: filing,
          liquidator: { ...rep, role: "清算人" },
        };
      }
      break;
    default:
      break;
  }
  return enriched;
}

export function buildSyntheticCase(procedureId: string, snap: CompanySnapshot): CorporateRegistrationCase {
  const base: CorporateRegistrationCase = {
    id: `SIMPL-${procedureId}`,
    procedure_id: procedureId,
    status: "draft",
    filing_date: currentDate(),
    self_filing: false,
    simplified: true,
    registry_office: "東京法務局",
    docs_root: `docs/corporate-registration/SIMPL-${procedureId}`,
  };
  const catalog = loadCatalog();
  const procedure = findProcedure(procedureId, catalog);
  if (!procedure) throw new Error(`Unknown procedure: ${procedureId}`);
  return enrichCaseWithDefaults(base, snap, procedure);
}

const SIMPLIFIED_HEADER =
  "> **簡略雛形（非提出稿）** — 法務局最新様式 · 登記ねっと所定項目と照合し、司法書士が最終確認すること。\n\n";

function finalizeDocumentContent(content: string, simplified: boolean): string {
  if (!simplified) return content;
  if (content.includes("簡略雛形")) return content;
  return SIMPLIFIED_HEADER + content;
}

function buildFilingPackIndex(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  outputs: Array<{ name: string }>,
  snap: CompanySnapshot
): string {
  const rows = outputs
    .map((o, i) => `| ${i + 1} | ${o.name} | ${caseEntry.simplified ? "簡略" : "標準"} |`)
    .join("\n");
  return [
    `# 登記書類パック — ${caseEntry.id}`,
    "",
    `| 項目 | 内容 |`,
    `|------|------|`,
    `| 手続 | ${procedure.name_ja} (\`${procedure.id}\`) |`,
    `| 商号 | ${resolveCompanyName(caseEntry, snap)} |`,
    `| 管轄 | ${caseEntry.registry_office} |`,
    `| 申請予定日 | ${toReiwaDate(caseEntry.filing_date)} |`,
    `| 雛形 | ${caseEntry.simplified ? "**簡略雛形**" : "標準"} |`,
    "",
    "## 書類一覧",
    "",
    "| # | ファイル | 区分 |",
    "|---|---------|------|",
    rows,
    "",
    "## 提出前チェック",
    "",
    "- [ ] 登録免許税 · 印紙",
    "- [ ] 印鑑証明書（3か月以内）",
    "- [ ] 定款認証（設立 · 定款変更時）",
    "- [ ] 登記ねっとまたは法務局窓口で様式最終確認",
    "- [ ] 司法書士レビュー",
    "",
    procedure.fee_note ? `**手数料目安:** ${procedure.fee_note}` : "",
    "",
    caseEntry.notes ? `**案件メモ:** ${caseEntry.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function loadCatalog() {
  const loaded = loadModuleDataFile(
    MODULE_ID,
    "procedures-catalog.yaml",
    corporateRegistrationProceduresFileSchema
  );
  return loaded
    ? { ...loaded, data: corporateRegistrationProceduresFileSchema.parse(loaded.data) }
    : null;
}

function loadSources() {
  const loaded = loadModuleDataFile(
    MODULE_ID,
    "sources.yaml",
    corporateRegistrationFormsFileSchema
  );
  return loaded
    ? { ...loaded, data: corporateRegistrationFormsFileSchema.parse(loaded.data) }
    : null;
}

function loadCases() {
  const loaded = loadModuleDataFile(
    MODULE_ID,
    "case-registry.yaml",
    corporateRegistrationCaseRegistryFileSchema
  );
  return loaded
    ? { ...loaded, data: corporateRegistrationCaseRegistryFileSchema.parse(loaded.data) }
    : null;
}

function findProcedure(id: string, catalog: ReturnType<typeof loadCatalog>): CorporateRegistrationProcedure | undefined {
  return catalog?.data.procedures.find((p) => p.id === id);
}

function findCase(id: string, registry: ReturnType<typeof loadCases>) {
  return registry?.data.cases.find((c) => c.id === id);
}

function toReiwaDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const reiwa = y - 2018;
  return `令和${reiwa}年${m}月${d}日`;
}

function formatYen(n: number): string {
  return n.toLocaleString("ja-JP");
}

function isSelfFiling(caseEntry: CorporateRegistrationCase): boolean {
  return caseEntry.self_filing === true || (caseEntry.notes?.includes("自社") ?? false);
}

function isHeadOfficeProcedure(procedureId: string): boolean {
  return procedureId.startsWith("head_office_relocation");
}

const TOKYO_23_WARDS = [
  "千代田区", "中央区", "港区", "新宿区", "文京区", "台東区", "墨田区", "江東区",
  "品川区", "目黒区", "大田区", "世田谷区", "渋谷区", "中野区", "杉並区", "豊島区",
  "北区", "荒川区", "板橋区", "練馬区", "足立区", "葛飾区", "江戸川区",
];

function addressPlain(addr: string): string {
  return addr.replace(/^〒\d{3}-\d{4}\s*/, "").trim();
}

function formatCorporateNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw;
  return `${digits.slice(0, 4)}－${digits.slice(4, 6)}－${digits.slice(6)}`;
}

function inferHeadOfficeCrossBureau(
  oldAddress: string,
  newAddress: string,
  explicit?: boolean
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  const inTokyo23 = (a: string) =>
    a.includes("東京都") && TOKYO_23_WARDS.some((w) => a.includes(w));
  if (inTokyo23(oldAddress) && inTokyo23(newAddress)) return false;
  const oldPref = oldAddress.match(/^[^都道府県]+[都道府県]/)?.[0] ?? "";
  const newPref = newAddress.match(/^[^都道府県]+[都道府県]/)?.[0] ?? "";
  return oldPref !== newPref;
}

function normalizeRegistryOffice(name: string): string {
  return name.replace(/（.*?）/g, "").replace(/\s+/g, "").trim() || "東京法務局";
}

function buildHeadOfficeRegistrationPurpose(
  caseEntry: CorporateRegistrationCase,
  target: "default" | "old" | "new" | "kannai"
): string {
  const hoc = caseEntry.head_office_change;
  if (!hoc) return "本店移転";
  const newPlain = addressPlain(hoc.new_address);
  const effective = hoc.effective_date ?? hoc.resolution_date;
  const effectiveReiwa = toReiwaDate(effective);
  const crossBureau = inferHeadOfficeCrossBureau(hoc.old_address, hoc.new_address, hoc.cross_bureau);

  if (!crossBureau || target === "kannai") {
    return `「本店」${newPlain}\n「原因年月日」${effectiveReiwa}移転`;
  }
  if (target === "old") {
    return `「登記記録に関する事項」${effectiveReiwa}${newPlain}に本店移転`;
  }
  if (target === "new") {
    return `「登記記録に関する事項」${effectiveReiwa}${newPlain}から本店移転`;
  }
  return `「登記記録に関する事項」${effectiveReiwa}${newPlain}に本店移転`;
}

function buildBoardSignatureRowsTex(
  directors: Array<{ name: string; role?: string }>
): string {
  return directors
    .map((d, i) => {
      const label = i === 0 ? "出席取締役" : "同";
      return `${label} & ${d.name} & ㊞ \\\\`;
    })
    .join("\n");
}

function buildAttachmentsSubmissionTex(
  resolutionBody: string,
  crossBureau: boolean,
  target: "main" | "new_bureau"
): string {
  if (crossBureau && target === "new_bureau") {
    return "（該当なし）";
  }
  if (resolutionBody === "board") {
    return "取締役会議事録\\quad １通";
  }
  return "株主総会議事録\\quad １通\\\\ 取締役会議事録\\quad １通";
}

function buildBoardOpeningParagraph(
  caseEntry: CorporateRegistrationCase,
  directors: Array<{ name: string; role?: string }>,
  resolutionReiwa: string
): string {
  const hoc = caseEntry.head_office_change;
  const start = hoc?.meeting_start_time ?? "10時00分";
  const end = hoc?.meeting_end_time ?? "10時30分";
  const place = hoc?.meeting_place ?? "当会社本店";
  const count = directors.length;
  return (
    `${resolutionReiwa}午前${start}${place}において、取締役${count}名（総取締役数${count}名）` +
    `出席のもとに、取締役会を開催し、下記議案につき可決確定のうえ、午前${end}分散会した。`
  );
}

function buildBoardAttendingDirectorsTex(
  directors: Array<{ name: string; role?: string }>,
  chairName: string
): string {
  return directors
    .map((d) => {
      const suffix = d.name === chairName ? "（議長）" : "";
      return `${d.name}${suffix}`;
    })
    .join("\\\\\n");
}

function buildBoardAttendingDirectorsMd(
  directors: Array<{ name: string; role?: string }>,
  chairName: string
): string {
  return directors
    .map((d) => {
      const suffix = d.name === chairName ? "（議長）" : "";
      return `- ${d.name}${suffix}`;
    })
    .join("\n");
}

function augmentHeadOfficeSubmissionVars(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  snap: CompanySnapshot,
  base: Record<string, string>
): Record<string, string> {
  const hoc = caseEntry.head_office_change;
  if (!hoc) return base;

  const directors = snap.directors?.length
    ? snap.directors
    : [{ name: base.representative_primary, role: "代表取締役" }];
  const chairName = base.representative_primary;
  const effectiveDate = hoc.effective_date ?? hoc.resolution_date;
  const effectiveReiwa = toReiwaDate(effectiveDate);
  const resolutionReiwa = toReiwaDate(hoc.resolution_date);
  const newPlain = addressPlain(hoc.new_address);
  const oldPlain = addressPlain(hoc.old_address);
  const crossBureau = inferHeadOfficeCrossBureau(hoc.old_address, hoc.new_address, hoc.cross_bureau);
  const registryOffice = normalizeRegistryOffice(caseEntry.registry_office);
  const resolutionBody = hoc.resolution_body ?? "board";
  const applicantAddr = hoc.old_address;
  const repAddr = hoc.old_address;
  const attachmentMd = "取締役会議事録　1通";
  const recordCellKannai = `「本店」${newPlain}　「原因年月日」${effectiveReiwa}移転`;
  const recordCellOld = `\\parbox[t]{11cm}{「登記記録に関する事項」${effectiveReiwa}${newPlain}に本店移転}`;
  const recordCellNew = `\\parbox[t]{11cm}{「登記記録に関する事項」${effectiveReiwa}${newPlain}から本店移転}`;

  return {
    ...base,
    cross_bureau: String(crossBureau),
    cross_bureau_label: crossBureau ? "あり" : "なし",
    effective_date: effectiveDate,
    effective_date_reiwa: effectiveReiwa,
    new_address_plain: newPlain,
    old_address_plain: oldPlain,
    corporate_number_formatted: formatCorporateNumber(snap.corporate_number ?? base.corporate_number),
    company_name_kana: "",
    board_opening_paragraph: buildBoardOpeningParagraph(caseEntry, directors, resolutionReiwa),
    board_attending_directors_tex: buildBoardAttendingDirectorsTex(directors, chairName),
    board_attending_directors_md: buildBoardAttendingDirectorsMd(directors, chairName),
    board_signature_rows_tex: buildBoardSignatureRowsTex(directors),
    board_auditor_row_tex: "",
    board_auditor_sign_note: "",
    applicant_head_office: hoc.old_address,
    applicant_head_office_new: hoc.new_address,
    applicant_address_line: applicantAddr,
    applicant_address_line_new: hoc.new_address,
    representative_address_line: repAddr,
    representative_address_line_new: hoc.new_address,
    contact_phone: "　　　　　　　　　　　",
    registration_record_entry: buildHeadOfficeRegistrationPurpose(caseEntry, "kannai"),
    registration_record_cell_tex: recordCellKannai,
    registration_record_cell_tex_old: recordCellOld,
    registration_record_cell_tex_new: recordCellNew,
    registration_record_entry_old: `${effectiveReiwa}${newPlain}に本店移転`,
    registration_record_entry_new: `${effectiveReiwa}${newPlain}から本店移転`,
    registration_purpose_block: buildHeadOfficeRegistrationPurpose(
      caseEntry,
      crossBureau ? "new" : "kannai"
    ),
    registration_purpose_block_old: buildHeadOfficeRegistrationPurpose(caseEntry, "old"),
    registration_purpose_block_new: buildHeadOfficeRegistrationPurpose(caseEntry, "new"),
    registration_fee_yen: "３万",
    attachments_submission_block: attachmentMd,
    attachments_submission_tex: buildAttachmentsSubmissionTex(resolutionBody, crossBureau, "main"),
    attachments_submission_tex_new: buildAttachmentsSubmissionTex(resolutionBody, crossBureau, "new_bureau"),
    attachments_submission_block_old: attachmentMd,
    attachments_submission_block_new: crossBureau ? "（該当なし）" : attachmentMd,
    registry_office_recipient: registryOffice,
    registry_office_recipient_old: normalizeRegistryOffice(hoc.registry_office_old ?? registryOffice),
    registry_office_recipient_new: normalizeRegistryOffice(hoc.registry_office_new ?? registryOffice),
    registry_office: registryOffice,
    registry_office_old: normalizeRegistryOffice(hoc.registry_office_old ?? registryOffice),
    registry_office_new: normalizeRegistryOffice(hoc.registry_office_new ?? registryOffice),
    attachments_block: attachmentMd,
    fee_note: "金３万円",
    official_form_id: crossBureau ? "moj-1-14" : "moj-1-13",
    official_form_url: crossBureau
      ? "https://houmukyoku.moj.go.jp/homu/content/001252661.pdf"
      : "https://houmukyoku.moj.go.jp/homu/content/001364566.pdf",
  };
}

function resolveRegistryOfficeOld(caseEntry: CorporateRegistrationCase): string {
  return (
    caseEntry.head_office_change?.registry_office_old ??
    `${caseEntry.registry_office}（移転前本店管轄）`
  );
}

function resolveRegistryOfficeNew(caseEntry: CorporateRegistrationCase): string {
  return caseEntry.head_office_change?.registry_office_new ?? caseEntry.registry_office;
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
  if (!path) throw new Error(`Template not found: ${templateRel}`);
  return readFileSync(path, "utf-8");
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function personLines(people: Array<{ name: string; address?: string; role?: string }>, numbered = true): string {
  if (!people.length) return "（該当なし）";
  return people
    .map((p, i) => {
      const prefix = numbered ? `${i + 1}. ` : "- ";
      const role = p.role ? `（${p.role}）` : "";
      const addr = p.address ? ` — ${p.address}` : "";
      return `${prefix}${p.name}${role}${addr}`;
    })
    .join("\n");
}

function signatureLines(names: string[]): string {
  return names.map((n) => `${n}　㊞`).join("\n\n");
}

function resolveCompanyName(caseEntry: CorporateRegistrationCase, snap: CompanySnapshot): string {
  if (caseEntry.incorporation?.company_name) return caseEntry.incorporation.company_name;
  if (caseEntry.trade_name_change?.new_name) return caseEntry.trade_name_change.new_name;
  return snap.name;
}

function resolveHeadOffice(caseEntry: CorporateRegistrationCase, snap: CompanySnapshot): string {
  if (caseEntry.incorporation?.head_office) return caseEntry.incorporation.head_office;
  if (caseEntry.head_office_change?.new_address) return caseEntry.head_office_change.new_address;
  return snap.address ?? "（要記載）";
}

function primaryRepresentative(caseEntry: CorporateRegistrationCase, snap: CompanySnapshot): string {
  const fromCase =
    caseEntry.incorporation?.directors.find((d) => d.role?.includes("代表"))?.name ??
    caseEntry.officer_change?.appointing.find((d) => d.role?.includes("代表"))?.name;
  if (fromCase) return fromCase;
  const fromCompany = snap.directors?.find((d) => d.role?.includes("代表"))?.name;
  if (fromCompany) return fromCompany;
  return snap.representative?.split(/[、,]/)[0]?.trim() ?? "（要記載）";
}

function buildDraftVars(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  snap: CompanySnapshot,
  sources: ReturnType<typeof loadSources>,
  officerOverride?: { name: string; address?: string; role?: string }
): Record<string, string> {
  const companyName = resolveCompanyName(caseEntry, snap);
  const headOffice = resolveHeadOffice(caseEntry, snap);
  const repPrimary = primaryRepresentative(caseEntry, snap);
  const inc = caseEntry.incorporation;
  const purposes = inc?.purposes ?? caseEntry.purpose_change?.new_purposes ?? splitBusinessPurposes(snap.business_description);
  const purposesBlock = purposes.map((p, i) => `(${i + 1}) ${p}`).join("\n");
  const directors: Array<{ name: string; address?: string; role?: string }> =
    inc?.directors ?? caseEntry.officer_change?.appointing ?? snap.directors ?? [];
  const promoters = inc?.promoters ?? [];
  const branch = caseEntry.branch_change;
  const reorg = caseEntry.corporate_reorg;
  const resolutionDate =
    caseEntry.officer_change?.resolution_date ??
    caseEntry.head_office_change?.resolution_date ??
    caseEntry.trade_name_change?.resolution_date ??
    caseEntry.purpose_change?.resolution_date ??
    caseEntry.capital_change?.resolution_date ??
    caseEntry.branch_change?.resolution_date ??
    caseEntry.corporate_reorg?.resolution_date ??
    caseEntry.dissolution?.resolution_date ??
    caseEntry.liquidation_completion?.resolution_date ??
    caseEntry.filing_date;
  const effectiveDate =
    caseEntry.head_office_change?.effective_date ??
    caseEntry.head_office_change?.resolution_date ??
    resolutionDate;
  const resolutionBody =
    caseEntry.officer_change?.resolution_body ??
    caseEntry.head_office_change?.resolution_body ??
    caseEntry.dissolution?.resolution_body ??
    (isHeadOfficeProcedure(procedure.id) ? "board" : "shareholders");
  const officer = officerOverride ?? directors[0] ?? { name: repPrimary, role: "代表取締役", address: headOffice };
  const toukiUrl = sources?.data.sources.find((s) => s.id === "touki-portal")?.url ?? "https://www.touki.or.jp/";
  const mojUrl = sources?.data.sources.find((s) => s.id === "moj-registry-guide")?.url ?? "https://www.moj.go.jp/homu/homu_06.html";

  const attachments = procedure.form_ids
    .filter((id) => id !== "form-touki-shinseisho")
    .map((id) => `- ${FORM_OUTPUT_NAMES[id]?.replace(".md", "") ?? id}`)
    .join("\n");

  const registrationPurpose = isHeadOfficeProcedure(procedure.id)
    ? buildHeadOfficeRegistrationPurpose(caseEntry, "kannai")
    : procedure.name_ja;
  const registrationPurposeOld = isHeadOfficeProcedure(procedure.id)
    ? buildHeadOfficeRegistrationPurpose(caseEntry, "old")
    : registrationPurpose;
  const registrationPurposeNew = isHeadOfficeProcedure(procedure.id)
    ? buildHeadOfficeRegistrationPurpose(caseEntry, "new")
    : registrationPurpose;

  const agentBlockTex = caseEntry.agent_name
    ? `\\section*{代理人}\n${caseEntry.agent_name}${
        caseEntry.agent_registration_no ? `（登録番号 ${caseEntry.agent_registration_no}）` : ""
      }`
    : "";

  const baseVars = {
    case_id: caseEntry.id,
    procedure_id: procedure.id,
    procedure_name: procedure.name_ja,
    generated_iso: currentDate(),
    filing_date: caseEntry.filing_date,
    filing_date_reiwa: toReiwaDate(caseEntry.filing_date),
    resolution_date: resolutionDate,
    resolution_date_reiwa: toReiwaDate(resolutionDate),
    effective_date: effectiveDate,
    effective_date_reiwa: toReiwaDate(effectiveDate),
    registry_office: caseEntry.registry_office,
    reference_number: caseEntry.reference_number ?? "",
    company_name: companyName,
    corporate_number: snap.corporate_number ?? "（設立前）",
    head_office: headOffice,
    capital_yen: String(inc?.capital_yen ?? caseEntry.capital_change?.new_capital_yen ?? 0),
    capital_yen_formatted: formatYen(inc?.capital_yen ?? caseEntry.capital_change?.new_capital_yen ?? 0),
    old_capital_yen_formatted: formatYen(caseEntry.capital_change?.old_capital_yen ?? 0),
    new_capital_yen_formatted: formatYen(caseEntry.capital_change?.new_capital_yen ?? 0),
    capital_change_label:
      (caseEntry.capital_change?.new_capital_yen ?? 0) >= (caseEntry.capital_change?.old_capital_yen ?? 0)
        ? "増加"
        : "減少",
    purposes_block: purposesBlock || "（要記載）",
    promoters_block: personLines(promoters),
    directors_block: personLines(directors),
    representatives_block: personLines(directors.filter((d) => d.role?.includes("代表")), false),
    promoters_signatures_block: signatureLines(promoters.map((p) => p.name)),
    promoter_name: promoters[0]?.name ?? repPrimary,
    promoter_count: String(promoters.length || 1),
    director_count: String(directors.length || 2),
    representative_count: String(directors.filter((d) => d.role?.includes("代表")).length || 1),
    authorized_shares: String(inc?.promoters[0]?.shares ?? 100),
    issued_shares: String(inc?.promoters[0]?.shares ?? 100),
    fiscal_year_end: inc?.fiscal_year_end ?? "1月31日",
    public_notice_method: "電子公告（官報公告に代わる）",
    meeting_time: "10時00分",
    representative_names: directors.map((d) => d.name).join("、") || snap.representative || repPrimary,
    representative_primary: repPrimary,
    resolution_body_label: RESOLUTION_BODY_LABELS[resolutionBody] ?? "株主総会",
    old_name: caseEntry.trade_name_change?.old_name ?? snap.name,
    new_name: caseEntry.trade_name_change?.new_name ?? companyName,
    old_address: caseEntry.head_office_change?.old_address ?? snap.address ?? "",
    new_address: caseEntry.head_office_change?.new_address ?? headOffice,
    cross_bureau_label: caseEntry.head_office_change?.cross_bureau ? "あり" : "なし",
    resigning_block: personLines(caseEntry.officer_change?.resigning ?? []),
    appointing_block: personLines(caseEntry.officer_change?.appointing ?? directors),
    officer_name: officer.name,
    officer_address: officer.address ?? headOffice,
    officer_role: officer.role ?? "取締役",
    liquidator_name: caseEntry.dissolution?.liquidator.name ?? repPrimary,
    liquidator_address: caseEntry.dissolution?.liquidator.address ?? headOffice,
    dissolution_reason: caseEntry.dissolution?.reason ?? "株主総会の決議による解散",
    change_subject: procedure.name_ja,
    articles_amendment_block: `（${procedure.name_ja}に伴う定款条文 — 司法書士が確定）`,
    registration_purpose_block: registrationPurpose,
    registration_purpose_block_old: registrationPurposeOld,
    registration_purpose_block_new: registrationPurposeNew,
    registry_office_old: resolveRegistryOfficeOld(caseEntry),
    registry_office_new: resolveRegistryOfficeNew(caseEntry),
    attachments_block: attachments || "（添付書類なし）",
    fee_note: procedure.fee_note ?? "登録免許税 — 最新の税額表を確認",
    branch_name: branch?.branch_name ?? "（支店名称 — 要記載）",
    branch_address: branch?.branch_address ?? "（支店所在地 — 要記載）",
    counterparty_name: reorg?.counterparty_name ?? "（相手方会社名 — 要記載）",
    template_tier: caseEntry.simplified !== false ? "簡略雛形" : "標準",
    source_touki_url: toukiUrl,
    source_moj_url: mojUrl,
    agent_block: caseEntry.agent_name
      ? `【代理人】\n${caseEntry.agent_name}${caseEntry.agent_registration_no ? `（登録番号 ${caseEntry.agent_registration_no}）` : ""}`
      : "",
    agent_block_tex: agentBlockTex,
    agent_name: caseEntry.agent_name ?? "（司法書士名 — 要記載）",
  };

  if (isHeadOfficeProcedure(procedure.id)) {
    return augmentHeadOfficeSubmissionVars(caseEntry, procedure, snap, baseVars);
  }
  return baseVars;
}

function resolveFormsForProcedure(
  procedure: CorporateRegistrationProcedure,
  sources: ReturnType<typeof loadSources>,
  formFilter?: string
): CorporateRegistrationForm[] {
  const all = sources?.data.forms ?? [];
  const byId = new Map(all.map((f) => [f.id, f]));
  let ids = procedure.form_ids;
  if (formFilter) {
    const match = all.find((f) => f.id === formFilter || f.name.includes(formFilter));
    if (match) ids = [match.id];
    else throw new Error(`Unknown form: ${formFilter}`);
  }
  return ids.map((id) => {
    const form = byId.get(id);
    if (!form) throw new Error(`Form ${id} not in sources.yaml`);
    return form;
  });
}

function generateFormOutputs(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  forms: CorporateRegistrationForm[],
  snap: CompanySnapshot,
  sources: ReturnType<typeof loadSources>
): Array<{ name: string; content: string }> {
  const outputs: Array<{ name: string; content: string }> = [];
  for (const form of forms) {
    if (form.id === "form-shussho-dojisho") {
      const appointing =
        caseEntry.incorporation?.directors ??
        caseEntry.officer_change?.appointing ??
        snap.directors ??
        [{ name: primaryRepresentative(caseEntry, snap), role: "代表取締役" }];
      for (const officer of appointing) {
        const vars = buildDraftVars(caseEntry, procedure, snap, sources, officer);
        const base = FORM_OUTPUT_NAMES[form.id] ?? `${form.id}.md`;
        const slug = officer.name.replace(/\s+/g, "");
        outputs.push({
          name: base.replace(".md", `-${slug}.md`),
          content: finalizeDocumentContent(renderTemplate(loadTemplate(form.template), vars), caseEntry.simplified !== false),
        });
      }
      continue;
    }
    const vars = buildDraftVars(caseEntry, procedure, snap, sources);
    outputs.push({
      name: FORM_OUTPUT_NAMES[form.id] ?? `${form.id}.md`,
      content: finalizeDocumentContent(renderTemplate(loadTemplate(form.template), vars), caseEntry.simplified !== false),
    });
  }
  return outputs;
}

function generateFilingPack(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  snap: CompanySnapshot,
  sources: ReturnType<typeof loadSources>,
  formFilter?: string
): Array<{ name: string; content: string }> {
  const enriched = enrichCaseWithDefaults(caseEntry, snap, procedure);
  const forms = resolveFormsForProcedure(procedure, sources, formFilter);
  const outputs = generateFormOutputs(enriched, procedure, forms, snap, sources);
  const indexContent = finalizeDocumentContent(
    buildFilingPackIndex(enriched, procedure, outputs, snap),
    enriched.simplified !== false
  );
  return [{ name: "00-filing-pack-index.md", content: indexContent }, ...outputs];
}

export function runJpCorporatePrepare(opts: {
  case?: string;
  procedure?: string;
  all?: boolean;
  sampleAll?: boolean;
  write?: boolean;
  json?: boolean;
  eventId?: string;
}): void {
  const catalog = loadCatalog();
  const registry = loadCases();
  const sources = loadSources();
  if (!catalog || !sources) {
    console.error("Module data missing — run validate");
    process.exit(1);
  }
  const snap = loadCompanySnapshot();
  const packs: Array<{
    case_id: string;
    procedure_id: string;
    outputs: Array<{ name: string; path: string }>;
  }> = [];

  let casesToRun: CorporateRegistrationCase[] = [];

  if (opts.sampleAll) {
    casesToRun = catalog.data.procedures.map((p) => buildSyntheticCase(p.id, snap));
  } else if (opts.all) {
    if (!registry?.data.cases.length) {
      console.error("No cases in case-registry.yaml");
      process.exit(1);
    }
    casesToRun = registry.data.cases.map((c) => {
      const proc = findProcedure(c.procedure_id, catalog)!;
      return enrichCaseWithDefaults(c, snap, proc);
    });
  } else if (opts.procedure) {
    casesToRun = [buildSyntheticCase(opts.procedure, snap)];
  } else if (opts.case) {
    const found = findCase(opts.case, registry);
    if (!found) {
      console.error(`Case ${opts.case} not found`);
      process.exit(1);
    }
    const proc = findProcedure(found.procedure_id, catalog);
    if (!proc) {
      console.error(`Procedure ${found.procedure_id} not found`);
      process.exit(1);
    }
    casesToRun = [enrichCaseWithDefaults(found, snap, proc)];
  } else {
    console.error("Specify --case, --procedure, --all, or --sample-all");
    process.exit(1);
  }

  for (const caseEntry of casesToRun) {
    const procedure = findProcedure(caseEntry.procedure_id, catalog)!;
    const outputs = generateFilingPack(caseEntry, procedure, snap, sources);
    let docsRoot = caseEntry.docs_root ?? `docs/corporate-registration/${caseEntry.id}`;
    if (opts.eventId) {
      const event = findCompanyEventById(opts.eventId);
      if (!event) {
        console.error(`Company event ${opts.eventId} not found — create with events new first`);
        process.exit(1);
      }
      docsRoot = event.artifact_dir.replace(/\/$/, "");
    }
    const absDocsRoot = join(getDocsDir(), docsRoot.replace(/^docs\//, ""));

    const written: Array<{ name: string; path: string }> = [];
    if (opts.write) {
      for (const out of outputs) {
        const path = writeTrackedFile(join(absDocsRoot, out.name), out.content);
        written.push({ name: out.name, path });
      }
      if (opts.eventId) {
        registerArtifactFiles(opts.eventId, written.map((w) => w.name), { kind: "filing-pack-md" });
      }
    } else {
      for (const out of outputs) {
        written.push({ name: out.name, path: join(docsRoot, out.name) });
      }
    }
    packs.push({ case_id: caseEntry.id, procedure_id: procedure.id, outputs: written });
  }

  if (opts.json) {
    console.log(JSON.stringify({ written: opts.write ?? false, packs }, null, 2));
    return;
  }

  console.log(`# Prepare — ${packs.length} 件の書類パック（簡略雛形）\n`);
  for (const pack of packs) {
    console.log(`## ${pack.case_id} · ${pack.procedure_id} · ${pack.outputs.length} ファイル`);
    for (const o of pack.outputs) {
      console.log(opts.write ? `✓ ${o.path}` : `- ${o.path}`);
    }
    console.log("");
  }
  if (!opts.write) {
    console.log("---\n`--write` で docs/corporate-registration/ に保存");
    if (opts.eventId) {
      console.log(`  --event-id ${opts.eventId} 指定時は docs/company/artifacts/{YYYY-MM}/{event-id}/ に保存`);
    }
  }
}

export function runJpCorporateProcedures(opts: { json?: boolean; category?: string }): void {
  const catalog = loadCatalog();
  if (!catalog) {
    console.error("procedures-catalog.yaml not found");
    process.exit(1);
  }
  let procedures = catalog.data.procedures;
  if (opts.category) {
    procedures = procedures.filter((p) => p.category === opts.category || p.id === opts.category);
  }
  if (opts.json) {
    console.log(JSON.stringify({ jurisdiction: "JP", count: procedures.length, procedures }, null, 2));
    return;
  }
  console.log("# 法務局登記手続一覧（JP）\n");
  for (const cat of ["establishment", "change", "corporate_reorg", "termination"] as const) {
    const items = procedures.filter((p) => p.category === cat);
    if (!items.length) continue;
    console.log(`## ${CATEGORY_LABELS[cat]}\n`);
    for (const p of items) {
      console.log(`- \`${p.id}\` — **${p.name_ja}** · 書類 ${p.form_ids.length} 件`);
      if (p.fee_note) console.log(`  - 手数料: ${p.fee_note}`);
    }
    console.log("");
  }
}

export function runJpCorporateShow(opts: { json?: boolean }): void {
  const catalog = loadCatalog();
  const registry = loadCases();
  const sources = loadSources();
  const jurisdiction = getResolvedJurisdiction();
  const summary = {
    jurisdiction: jurisdiction.code,
    procedures: catalog?.data.procedures.length ?? 0,
    cases: registry?.data.cases.length ?? 0,
    forms: sources?.data.forms.length ?? 0,
    cases_list: registry?.data.cases ?? [],
  };
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`# jp_corporate_registration\n`);
  console.log(`法域: ${jurisdiction.code} · 手続 ${summary.procedures} · 案件 ${summary.cases} · 書式 ${summary.forms}\n`);
  console.log("```bash");
  console.log("npm run orgos -- operations corporate procedures");
  console.log("npm run orgos -- operations corporate prepare --case INC-2026-001 --write");
  console.log("npm run orgos -- operations corporate prepare --procedure dissolution --write");
  console.log("```\n");
  if (registry?.data.cases.length) {
    console.log("## 案件\n");
    for (const c of registry.data.cases) {
      console.log(`- \`${c.id}\` · ${c.procedure_id} · ${c.status}`);
    }
  }
}

export function runJpCorporateValidate(): void {
  const errors: string[] = [];
  const catalog = loadCatalog();
  const registry = loadCases();
  const sources = loadSources();
  if (!catalog) errors.push("procedures-catalog.yaml missing");
  if (!registry) errors.push("case-registry.yaml missing");
  if (!sources) errors.push("sources.yaml missing");
  if (catalog && sources) {
    const formIds = new Set(sources.data.forms.map((f) => f.id));
    for (const p of catalog.data.procedures) {
      for (const fid of p.form_ids) {
        if (!formIds.has(fid)) errors.push(`procedure ${p.id}: unknown form ${fid}`);
      }
    }
    for (const form of sources.data.forms) {
      if (!resolveTemplatePath(form.template)) {
        errors.push(`form ${form.id}: template missing (${form.template})`);
      }
    }
  }
  if (registry && catalog) {
    const procIds = new Set(catalog.data.procedures.map((p) => p.id));
    for (const c of registry.data.cases) {
      if (!procIds.has(c.procedure_id)) errors.push(`${c.id}: unknown procedure_id ${c.procedure_id}`);
    }
  }
  if (errors.length) {
    console.error("✗ jp_corporate_registration:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("✓ jp_corporate_registration — corporate registration data OK");
}

export interface ChecklistItem {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export function runJpCorporateChecklist(opts: { case: string; json?: boolean }): void {
  const registry = loadCases();
  const catalog = loadCatalog();
  const caseEntry = findCase(opts.case, registry);
  if (!caseEntry || !catalog) {
    console.error(`Case ${opts.case} not found`);
    process.exit(1);
  }
  const procedure = findProcedure(caseEntry.procedure_id, catalog);
  if (!procedure) {
    console.error(`Procedure ${caseEntry.procedure_id} not found`);
    process.exit(1);
  }
  const snap = loadCompanySnapshot();
  const jurisdiction = getResolvedJurisdiction();
  const checks: ChecklistItem[] = [];

  checks.push({
    id: "req-jp",
    label: "日本法域テナント",
    ok: jurisdiction.code === "JP",
    detail: jurisdiction.code,
  });
  checks.push({
    id: "procedure-forms",
    label: "手続に書式定義あり",
    ok: procedure.form_ids.length > 0,
    detail: `${procedure.form_ids.length} forms`,
  });

  if (caseEntry.procedure_id === "incorporation") {
    const inc = caseEntry.incorporation;
    checks.push({
      id: "inc-name",
      label: "設立商号",
      ok: Boolean(inc?.company_name),
      detail: inc?.company_name ?? "missing",
    });
    checks.push({
      id: "inc-capital",
      label: "資本金",
      ok: (inc?.capital_yen ?? 0) > 0,
      detail: inc ? formatYen(inc.capital_yen) : "missing",
    });
    checks.push({
      id: "inc-directors",
      label: "設立時役員",
      ok: (inc?.directors.length ?? 0) > 0,
      detail: `${inc?.directors.length ?? 0}名`,
    });
  } else {
    checks.push({
      id: "company-name",
      label: "商号（company または case）",
      ok: Boolean(resolveCompanyName(caseEntry, snap)),
      detail: resolveCompanyName(caseEntry, snap),
    });
  }

  checks.push({
    id: "judicial-scrivener",
    label: isSelfFiling(caseEntry) ? "自社提出（司法書士任意）" : "司法書士確認（人間）",
    ok:
      isSelfFiling(caseEntry) ||
      caseEntry.status !== "draft" ||
      Boolean(caseEntry.agent_name),
    detail: isSelfFiling(caseEntry)
      ? "self_filing"
      : (caseEntry.agent_name ?? "agent_name 推奨"),
  });

  if (isHeadOfficeProcedure(procedure.id)) {
    const hoc = caseEntry.head_office_change;
    checks.push({
      id: "head-office-old",
      label: "移転前本店",
      ok: Boolean(hoc?.old_address),
      detail: hoc?.old_address ?? "missing",
    });
    checks.push({
      id: "head-office-new",
      label: "移転後本店",
      ok: Boolean(hoc?.new_address),
      detail: hoc?.new_address ?? "missing",
    });
    checks.push({
      id: "head-office-resolution",
      label: "決議日",
      ok: Boolean(hoc?.resolution_date),
      detail: hoc?.resolution_date ?? "missing",
    });
  }

  const passed = checks.every((c) => c.ok);
  const result = { case_id: caseEntry.id, procedure_id: procedure.id, passed, checks };
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`# Checklist — ${caseEntry.id} (${procedure.name_ja})\n`);
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.label} — ${c.detail}`);
  console.log(`\n${passed ? "PASS" : "要対応あり"}`);
}

export function runJpCorporateDraft(opts: {
  case: string;
  form?: string;
  write?: boolean;
  json?: boolean;
}): void {
  const registry = loadCases();
  const catalog = loadCatalog();
  const sources = loadSources();
  const caseEntry = findCase(opts.case, registry);
  if (!caseEntry || !catalog || !sources) {
    console.error(`Case ${opts.case} not found`);
    process.exit(1);
  }
  const procedure = findProcedure(caseEntry.procedure_id, catalog);
  if (!procedure) {
    console.error(`Procedure ${caseEntry.procedure_id} not found`);
    process.exit(1);
  }
  const snap = loadCompanySnapshot();
  const enriched = enrichCaseWithDefaults(caseEntry, snap, procedure);
  const forms = resolveFormsForProcedure(procedure, sources, opts.form);
  const outputs = generateFormOutputs(enriched, procedure, forms, snap, sources);
  const docsRoot = caseEntry.docs_root ?? `docs/corporate-registration/${caseEntry.id}`;
  const absDocsRoot = join(getDocsDir(), docsRoot.replace(/^docs\//, ""));

  if (opts.write) {
    for (const out of outputs) {
      writeTrackedFile(join(absDocsRoot, out.name), out.content);
    }
  }

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          case_id: caseEntry.id,
          procedure_id: procedure.id,
          procedure_name: procedure.name_ja,
          written: opts.write ?? false,
          outputs: outputs.map((o) => ({ name: o.name, path: join(docsRoot, o.name) })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`# Draft — ${caseEntry.id} · ${procedure.name_ja}\n`);
  if (opts.write) {
    for (const out of outputs) {
      console.log(`✓ wrote ${join(absDocsRoot, out.name)}`);
    }
  } else {
    for (const out of outputs) {
      console.log(`\n## ${out.name}\n`);
      console.log(out.content);
    }
    console.log("\n---\n`--write` で docs/corporate-registration/ に保存");
  }
}

function buildExportReadiness(
  caseEntry: CorporateRegistrationCase,
  procedure: CorporateRegistrationProcedure,
  snap: CompanySnapshot,
  sources: ReturnType<typeof loadSources>
): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!resolveCompanyName(caseEntry, snap)) missing.push("company_name");
  if (isHeadOfficeProcedure(procedure.id)) {
    const hoc = caseEntry.head_office_change;
    if (!hoc?.old_address) missing.push("head_office_change.old_address");
    if (!hoc?.new_address) missing.push("head_office_change.new_address");
    if (!hoc?.resolution_date) missing.push("head_office_change.resolution_date");
  }
  const texForms = resolveFormsForProcedure(procedure, sources).filter((f) => f.template_tex);
  if (!texForms.length && isHeadOfficeProcedure(procedure.id)) {
    missing.push("template_tex (honsha-iten / touki)");
  }
  if (!isSelfFiling(caseEntry) && !caseEntry.agent_name && caseEntry.status === "draft") {
    missing.push("agent_name (or self_filing: true)");
  }
  return { ready: missing.length === 0, missing };
}

function stageMojFormMacros(workDir: string): void {
  const src = resolveTemplatePath("templates/latex/moj-form-macros.tex.example");
  if (!src) throw new Error("MOJ form macros template not found");
  writeFileSync(join(workDir, "moj-form-macros.tex"), readFileSync(src, "utf-8"));
}

function buildHeadOfficeFilingPackTex(
  vars: Record<string, string>,
  crossBureau: boolean
): string {
  const honshaTex = loadTemplate("templates/honsha-iten-ketsugi.tex.example");
  const packTex = loadTemplate("templates/head-office-relocation-pack.tex.example");
  const honshaSection = renderTemplate(honshaTex, vars);

  let toukiSection = "";
  let toukiOldSection = "";
  if (crossBureau) {
    toukiSection = renderTemplate(
      loadTemplate("templates/honten-iten-touki-kangai-old.tex.example"),
      vars
    );
    toukiOldSection = `\\newpage\n${renderTemplate(
      loadTemplate("templates/honten-iten-touki-kangai-new.tex.example"),
      vars
    )}`;
  } else {
    toukiSection = renderTemplate(
      loadTemplate("templates/honten-iten-touki-kannai.tex.example"),
      vars
    );
  }

  return renderTemplate(packTex, {
    latex_font_setup: buildJapaneseLatexFontSetup(),
    honsha_section: honshaSection,
    touki_section: toukiSection,
    touki_old_section: toukiOldSection,
  });
}

export function runJpCorporateExportPdf(opts: {
  case: string;
  write?: boolean;
  force?: boolean;
  json?: boolean;
}): void {
  const registry = loadCases();
  const catalog = loadCatalog();
  const sources = loadSources();
  const caseEntry = findCase(opts.case, registry);
  if (!caseEntry || !catalog || !sources) {
    console.error(`Case ${opts.case} not found`);
    process.exit(1);
  }
  const procedure = findProcedure(caseEntry.procedure_id, catalog);
  if (!procedure) {
    console.error(`Procedure ${caseEntry.procedure_id} not found`);
    process.exit(1);
  }
  const snap = loadCompanySnapshot();
  const enriched = enrichCaseWithDefaults(caseEntry, snap, procedure);
  const readiness = buildExportReadiness(enriched, procedure, snap, sources);
  if (!readiness.ready && !opts.force) {
    console.error("Export checklist incomplete. Fix missing fields or use --force");
    console.error(`Missing: ${readiness.missing.join(", ")}`);
    process.exit(1);
  }

  const vars = buildDraftVars(enriched, procedure, snap, sources);
  const crossBureau = enriched.head_office_change?.cross_bureau ?? false;
  let texContent: string;

  if (isHeadOfficeProcedure(procedure.id)) {
    texContent = buildHeadOfficeFilingPackTex(vars, crossBureau);
  } else {
    console.error(
      `PDF export is currently supported for head office relocation cases only (${procedure.id})`
    );
    process.exit(1);
  }

  const docsRoot = caseEntry.docs_root ?? `docs/corporate-registration/${caseEntry.id}`;
  const absDocsRoot = join(getDocsDir(), docsRoot.replace(/^docs\//, ""));
  const texPath = join(absDocsRoot, `${caseEntry.id}-filing-pack.tex`);
  const pdfOutDir = join(getDocsDir(), "io", "outbox", "submissions");
  const finalPdf = join(pdfOutDir, `${caseEntry.id}-filing-pack.pdf`);

  if (!opts.write) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            case_id: caseEntry.id,
            procedure_id: procedure.id,
            tex_path: texPath,
            pdf_path: finalPdf,
            ready: readiness.ready,
            missing: readiness.missing,
          },
          null,
          2
        )
      );
      return;
    }
    console.log(texContent);
    const engine = detectLatexEngine();
    console.error(
      `\nEngine: ${engine ?? "none"} · \`--write\` で ${texPath} → ${finalPdf}`
    );
    return;
  }

  const engine = detectLatexEngine();
  if (!engine) {
    console.error(
      "LaTeX (xelatex/tectonic) not installed. Install MacTeX / TeX Live or `brew install tectonic`, or use `corporate draft --write` for MD only."
    );
    process.exit(1);
  }

  mkdirSync(absDocsRoot, { recursive: true });
  mkdirSync(pdfOutDir, { recursive: true });
  stageMojFormMacros(absDocsRoot);
  const result = writeTexAndCompile(texContent, texPath, { engine, workDir: absDocsRoot });
  writeFileSync(finalPdf, readFileSync(result.pdfPath));

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          case_id: caseEntry.id,
          tex_path: texPath,
          pdf_path: finalPdf,
          engine: result.engine,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`✓ TeX: ${texPath}`);
  console.log(`✓ 提出用 PDF: ${finalPdf} (${result.engine})`);
}
