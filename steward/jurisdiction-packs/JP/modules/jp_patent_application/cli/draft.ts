import type {
  PatentApplication,
  PatentPriorityClaim,
  PatentSpecification,
} from "../../../../../../schemas/jp-patent.js";
import type { ApplicantSnapshot } from "./checklist.js";

/** 令和元年5月1日以降は「令和N年」（N = 西暦 − 2018） */
const REIWA_START = "2019-05-01";
const REIWA_YEAR_OFFSET = 2018;
const FULL_WIDTH_OFFSET = 0xfee0;
const IDEOGRAPHIC_SPACE = "\u3000";
/** 様式第29 備考18: 段落番号は4桁のアラビア数字 */
const PARAGRAPH_NUMBER_DIGITS = 4;
const TO_BE_FILLED = "（要記入）";

export interface DraftSourceUrls {
  law: string;
  form: string;
  fee: string;
}

export interface PatentDraftInput {
  app: PatentApplication;
  specification: PatentSpecification;
  applicant: ApplicantSnapshot;
  filingFeeJpy?: number;
  generatedOn: string;
  sourceUrls: DraftSourceUrls;
}

interface SpecificationSection {
  heading: string;
  paragraphs: readonly string[];
}

/** 様式第26 備考4 等: 書類中に半角文字を用いない（欄名の【】を除く） */
export function toFullWidth(text: string): string {
  return text.replace(/[\u0021-\u007e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + FULL_WIDTH_OFFSET)).replace(/ /g, IDEOGRAPHIC_SPACE);
}

export function toReiwaDate(iso: string): string {
  if (iso < REIWA_START) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `令和${year - REIWA_YEAR_OFFSET}年${month}月${day}日`;
}

/** 値が空のプレースホルダが単独で占める行は行ごと削除する（任意欄の省略）。 */
export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return Object.entries(vars).reduce((out, [key, value]) => {
    const withoutEmptyLine = value ? out : out.replace(new RegExp(`^[ \\t]*\\{\\{${key}\\}\\}[ \\t]*\\r?\\n`, "gm"), "");
    return withoutEmptyLine.replaceAll(`{{${key}}}`, value);
  }, template);
}

function field(name: string, value: string, indent = ""): string {
  return `${indent}【${name}】${IDEOGRAPHIC_SPACE}${value}`;
}

function inventorsBlock(app: PatentApplication): string {
  if (!app.inventor_stakeholder_ids.length) return `【発明者】\n${field("氏名", TO_BE_FILLED, IDEOGRAPHIC_SPACE)}`;
  return app.inventor_stakeholder_ids
    .map((id) =>
      [
        "【発明者】",
        field("住所又は居所", `${TO_BE_FILLED} L2 台帳 stakeholder_id: ${id} から人間が転記`, IDEOGRAPHIC_SPACE),
        field("氏名", `${TO_BE_FILLED} stakeholder_id: ${id}`, IDEOGRAPHIC_SPACE),
      ].join("\n")
    )
    .join("\n");
}

function applicantBlock(app: PatentApplication, applicant: ApplicantSnapshot): string {
  const lines = [
    "【特許出願人】",
    field("住所又は居所", applicant.address || `${TO_BE_FILLED} company.address`, IDEOGRAPHIC_SPACE),
    field("氏名又は名称", applicant.name, IDEOGRAPHIC_SPACE),
  ];
  if (!app.agent_name) lines.push(field("代表者", applicant.representative || TO_BE_FILLED, IDEOGRAPHIC_SPACE));
  const coApplicants = app.co_applicant_stakeholder_ids.map((id) =>
    ["【特許出願人】", field("住所又は居所", TO_BE_FILLED, IDEOGRAPHIC_SPACE), field("氏名又は名称", `${TO_BE_FILLED} stakeholder_id: ${id}`, IDEOGRAPHIC_SPACE)].join("\n")
  );
  return [lines.join("\n"), ...coApplicants].join("\n");
}

function agentBlock(app: PatentApplication): string {
  if (!app.agent_name) return "";
  return [
    "【代理人】",
    field("識別番号", app.agent_registration_no ? toFullWidth(app.agent_registration_no) : TO_BE_FILLED, IDEOGRAPHIC_SPACE),
    `${IDEOGRAPHIC_SPACE}【弁理士】`,
    field("氏名又は名称", app.agent_name, IDEOGRAPHIC_SPACE),
  ].join("\n");
}

/** 様式第26 備考27（パリ条約）· 備考28（国内優先）— パリ条約の欄を先に記載 */
function priorityBlock(claims: readonly PatentPriorityClaim[]): string {
  const paris = claims.filter((c) => c.kind === "paris").map((c) =>
    [
      "【パリ条約による優先権等の主張】",
      field("国・地域名", c.base_country ?? TO_BE_FILLED, IDEOGRAPHIC_SPACE),
      field("出願日", toReiwaDate(c.base_filed_on), IDEOGRAPHIC_SPACE),
      field("出願番号", c.base_application_no ? toFullWidth(c.base_application_no) : TO_BE_FILLED, IDEOGRAPHIC_SPACE),
    ].join("\n")
  );
  const domestic = claims.filter((c) => c.kind === "domestic").map((c) =>
    [
      "【先の出願に基づく優先権主張】",
      field("出願番号", c.base_application_no ? toFullWidth(c.base_application_no) : TO_BE_FILLED, IDEOGRAPHIC_SPACE),
      field("出願日", toReiwaDate(c.base_filed_on), IDEOGRAPHIC_SPACE),
    ].join("\n")
  );
  return [...paris, ...domestic].join("\n");
}

/** 様式第26 備考26: 30条2項の適用を受けようとする旨を【特記事項】に記載 */
function specialNotesBlock(app: PatentApplication): string {
  const ownActDisclosure = app.disclosures.some((d) => !d.against_will);
  return ownActDisclosure ? field("特記事項", "特許法第３０条第２項の規定の適用を受けようとする特許出願") : "";
}

function feeBlock(filingFeeJpy: number | undefined): string {
  const amount = filingFeeJpy === undefined ? `${TO_BE_FILLED} 料金表を確認` : toFullWidth(String(filingFeeJpy));
  return ["【手数料の表示】", field("予納台帳番号", TO_BE_FILLED, IDEOGRAPHIC_SPACE), field("納付金額", amount, IDEOGRAPHIC_SPACE)].join("\n");
}

function attachmentsBlock(spec: PatentSpecification): string {
  const items = ["特許請求の範囲", "明細書", ...(spec.drawings.length ? ["図面"] : []), "要約書"];
  return ["【提出物件の目録】", ...items.map((item) => field("物件名", `${item}${IDEOGRAPHIC_SPACE}１`, IDEOGRAPHIC_SPACE))].join("\n");
}

function joinBlocks(blocks: readonly string[]): string {
  return blocks.filter((block) => block.length > 0).join("\n");
}

function splitParagraphs(text: string | undefined): string[] {
  if (!text) return [];
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function paragraphNumber(counter: number): string {
  return `【${toFullWidth(String(counter).padStart(PARAGRAPH_NUMBER_DIGITS, "0"))}】`;
}

function priorArtSections(spec: PatentSpecification): SpecificationSection[] {
  const { patent, non_patent: nonPatent } = spec.prior_art_documents;
  if (!patent.length && !nonPatent.length) return [];
  const numbered = (label: string, docs: readonly string[]) =>
    docs.map((doc, index) => `【${label}${toFullWidth(String(index + 1))}】${IDEOGRAPHIC_SPACE}${doc}`).join("\n");
  return [
    { heading: "【先行技術文献】", paragraphs: [] },
    ...(patent.length ? [{ heading: "【特許文献】", paragraphs: [numbered("特許文献", patent)] }] : []),
    ...(nonPatent.length ? [{ heading: "【非特許文献】", paragraphs: [numbered("非特許文献", nonPatent)] }] : []),
  ];
}

/** 様式第29 の見出し順（備考14）。段落番号は備考18により見出し下の各段落・図の説明・符号の説明に付す。 */
export function buildSpecificationSections(spec: PatentSpecification): SpecificationSection[] {
  const drawings = spec.drawings.map((d) => `【図${toFullWidth(String(d.figure_no))}】${IDEOGRAPHIC_SPACE}${d.description}`);
  const signs = spec.reference_signs.map((s) => `${toFullWidth(s.sign)}${IDEOGRAPHIC_SPACE}${s.label}`).join("\n");
  const optional = (heading: string, paragraphs: readonly string[]) => (paragraphs.length ? [{ heading, paragraphs }] : []);
  return [
    { heading: "【技術分野】", paragraphs: splitParagraphs(spec.technical_field) },
    ...optional("【背景技術】", splitParagraphs(spec.background_art)),
    ...priorArtSections(spec),
    { heading: "【発明の概要】", paragraphs: [] },
    { heading: "【発明が解決しようとする課題】", paragraphs: splitParagraphs(spec.problem) },
    { heading: "【課題を解決するための手段】", paragraphs: splitParagraphs(spec.solution) },
    ...optional("【発明の効果】", splitParagraphs(spec.effects)),
    ...optional("【図面の簡単な説明】", drawings),
    { heading: "【発明を実施するための形態】", paragraphs: splitParagraphs(spec.embodiments) },
    ...optional("【産業上の利用可能性】", splitParagraphs(spec.industrial_applicability)),
    ...optional("【符号の説明】", signs ? [signs] : []),
  ];
}

export function renderNumberedSections(sections: readonly SpecificationSection[]): string {
  const lines: string[] = [];
  let counter = 0;
  for (const section of sections) {
    lines.push(section.heading);
    for (const paragraph of section.paragraphs) {
      counter += 1;
      lines.push(paragraphNumber(counter), paragraph);
    }
  }
  return lines.join("\n");
}

export function renderClaims(spec: PatentSpecification): string {
  return spec.claims.map((claim) => `【請求項${toFullWidth(String(claim.no))}】\n${claim.text.trim()}`).join("\n");
}

function selectedFigureLabel(spec: PatentSpecification): string {
  const selected = spec.abstract.selected_figure;
  return selected === undefined ? "なし" : `図${toFullWidth(String(selected))}`;
}

export function buildPatentDraftVars(input: PatentDraftInput): Record<string, string> {
  const { app, specification: spec, applicant } = input;
  const filingDate = app.filed_on ?? app.planned_filing_on ?? input.generatedOn;
  const referenceNumber = app.reference_number?.trim();
  return {
    application_id: app.id,
    generated_on: input.generatedOn,
    source_law_url: input.sourceUrls.law,
    source_form_url: input.sourceUrls.form,
    source_fee_url: input.sourceUrls.fee,
    reference_number: referenceNumber ? toFullWidth(referenceNumber) : TO_BE_FILLED,
    filing_date_reiwa: toReiwaDate(filingDate),
    special_notes_block: specialNotesBlock(app),
    ipc_block: app.ipc.length ? field("国際特許分類", app.ipc.map(toFullWidth).join(`\n${IDEOGRAPHIC_SPACE.repeat(8)}`)) : "",
    inventors_block: inventorsBlock(app),
    applicant_block: applicantBlock(app, applicant),
    agent_and_priority_block: joinBlocks([agentBlock(app), priorityBlock(app.priority_claims)]),
    fee_block: feeBlock(input.filingFeeJpy),
    attachments_block: attachmentsBlock(spec),
    invention_title: spec.invention_title,
    specification_body: renderNumberedSections(buildSpecificationSections(spec)),
    claims_body: renderClaims(spec),
    abstract_body: spec.abstract.text.trim(),
    selected_figure: selectedFigureLabel(spec),
  };
}
