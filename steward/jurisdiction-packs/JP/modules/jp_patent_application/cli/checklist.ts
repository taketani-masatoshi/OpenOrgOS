import type {
  PatentApplication,
  PatentClaim,
  PatentDisclosure,
  PatentPriorityClaim,
  PatentSpecification,
} from "../../../../../../schemas/jp-patent.js";
import { procedureDeadline, statutoryDaysEnd, type HolidayCalendar } from "./calendar.js";
import {
  assessFilingDate,
  filingOutcome,
  isExcludedFromNoveltyException,
  isHolidayExtensionVerified,
  NOVELTY_CERTIFICATE_DAYS,
  noveltyWindow,
  priorityWindow,
  submissionOutcome,
  type DeadlineStatus,
  type FilingWindow,
} from "./deadlines.js";

/** 様式第26 備考6: 整理番号はローマ字（大文字）・アラビア数字・「－」の組合せで10字以下 */
export const REFERENCE_NUMBER_MAX_LENGTH = 10;
const REFERENCE_NUMBER_PATTERN = /^[A-Z0-9-]+$/;
/** 様式第31 備考11ロ · 特許庁「要約書の概要」: 要約は400字以内 */
export const ABSTRACT_MAX_CHARS = 400;
const FULL_WIDTH_OFFSET = 0xfee0;
const HALF_WIDTH_PATTERN = /[\u0020-\u007e]/;
const CLAIM_CITATION_PATTERN = /請求項([0-9０-９]+)/g;

export type CheckStatus = "ok" | "ng" | "needs_review";

export interface PatentCheckItem {
  id: string;
  label: string;
  legal_basis: string;
  status: CheckStatus;
  detail: string;
}

export interface ApplicantSnapshot {
  name: string;
  address?: string;
  representative?: string;
}

export interface PatentChecklistInput {
  app: PatentApplication;
  specification: PatentSpecification | null;
  applicant: ApplicantSnapshot;
  jurisdictionCode: string;
  calendar: HolidayCalendar;
  asOf: string;
}

export interface PatentChecklistSummary {
  overall: CheckStatus;
  ng: number;
  needs_review: number;
  ok: number;
}

type CheckMeta = Pick<PatentCheckItem, "id" | "label" | "legal_basis">;

function check(meta: CheckMeta, status: CheckStatus, detail: string): PatentCheckItem {
  return { ...meta, status, detail };
}

function issuesCheck(meta: CheckMeta, issues: readonly string[], okDetail: string): PatentCheckItem {
  return issues.length ? check(meta, "ng", issues.join(" / ")) : check(meta, "ok", okDetail);
}

export function toCheckStatus(status: DeadlineStatus): CheckStatus {
  if (status === "done") return "ok";
  return status === "overdue" ? "ng" : "needs_review";
}

export function normalizeHalfWidth(text: string): string {
  return text.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULL_WIDTH_OFFSET));
}

export function isValidReferenceNumber(referenceNumber: string): boolean {
  const normalized = normalizeHalfWidth(referenceNumber.trim());
  return normalized.length <= REFERENCE_NUMBER_MAX_LENGTH && REFERENCE_NUMBER_PATTERN.test(normalized);
}

export function countAbstractChars(text: string): number {
  return [...text.trim().replace(/[\r\n]/g, "")].length;
}

/** 施行規則24条の3第1号・第2号: 請求項ごとに番号を付し、記載順の連続番号とする */
export function findClaimNumberingIssues(claims: readonly PatentClaim[]): string[] {
  return claims.flatMap((claim, index) =>
    claim.no === index + 1 ? [] : [`${index + 1} 番目の請求項の番号が ${claim.no}（連続番号でない）`]
  );
}

/** 施行規則24条の3第3号・第4号: 引用は番号で行い、引用する請求項より前に記載しない */
export function findClaimReferenceIssues(claims: readonly PatentClaim[]): string[] {
  const positions = new Map(claims.map((claim, index) => [claim.no, index]));
  return claims.flatMap((claim, index) =>
    claim.refers_to.flatMap((ref) => {
      const refPosition = positions.get(ref);
      if (refPosition === undefined) return [`請求項${claim.no}: 引用先の請求項${ref}が存在しない`];
      return refPosition >= index ? [`請求項${claim.no}: 後に記載された請求項${ref}を引用`] : [];
    })
  );
}

function citedClaimNumbers(text: string): number[] {
  return [...text.matchAll(CLAIM_CITATION_PATTERN)].map((match) => Number(normalizeHalfWidth(match[1])));
}

/** 本文中の「請求項N」と refers_to の整合（施行規則24条の3第3号の番号引用） */
export function findClaimTextReferenceMismatches(claims: readonly PatentClaim[]): string[] {
  return claims.flatMap((claim) => {
    const cited = citedClaimNumbers(claim.text);
    const unlisted = cited.filter((no) => !claim.refers_to.includes(no));
    const issues = unlisted.map((no) => `請求項${claim.no}: 本文の請求項${no}が refers_to にない`);
    if (claim.refers_to.length && !cited.length) issues.push(`請求項${claim.no}: refers_to があるが本文に引用番号がない`);
    return issues;
  });
}

function isAlternativeMultipleDependent(claim: PatentClaim): boolean {
  return claim.refers_to.length >= 2 && claim.reference_mode === "alternative";
}

/** 施行規則24条の3第5号: 択一的多数項引用の請求項は、択一的多数項引用の請求項を引用できない */
export function findMultipleDependencyIssues(claims: readonly PatentClaim[]): string[] {
  const byNo = new Map(claims.map((claim) => [claim.no, claim]));
  return claims.filter(isAlternativeMultipleDependent).flatMap((claim) =>
    claim.refers_to
      .filter((ref) => {
        const cited = byNo.get(ref);
        return cited !== undefined && isAlternativeMultipleDependent(cited);
      })
      .map((ref) => `請求項${claim.no}: 択一的多数項引用の請求項${ref}を択一的に引用（マルチマルチ）`)
  );
}

export function jurisdictionCheck(code: string): PatentCheckItem {
  const meta = { id: "req-jp", label: "日本法域テナントであること", legal_basis: "特許法（日本）" };
  return code === "JP" ? check(meta, "ok", "JP") : check(meta, "ng", `current: ${code} — 本モジュールの判定は適用外`);
}

const APPLICANT_BASIS = "特許法36条1項1号";
const APPLICANT_NAME_META = { id: "applicant-name", label: "特許出願人の氏名又は名称", legal_basis: APPLICANT_BASIS };
const APPLICANT_ADDRESS_META = { id: "applicant-address", label: "特許出願人の住所又は居所", legal_basis: APPLICANT_BASIS };
const REPRESENTATIVE_META = { id: "applicant-representative", label: "法人の【代表者】", legal_basis: "様式第26 備考11・19" };
const CO_APPLICANTS_META = { id: "co-applicants", label: "共同出願人", legal_basis: APPLICANT_BASIS };

function applicantChecks(app: PatentApplication, applicant: ApplicantSnapshot): PatentCheckItem[] {
  const items = [
    applicant.name
      ? check(APPLICANT_NAME_META, "ok", applicant.name)
      : check(APPLICANT_NAME_META, "ng", "company.name を設定"),
    applicant.address
      ? check(APPLICANT_ADDRESS_META, "ok", "company.address")
      : check(APPLICANT_ADDRESS_META, "ng", "company.address を設定（field-map 参照）"),
  ];
  if (!app.agent_name && !applicant.representative) {
    items.push(check(REPRESENTATIVE_META, "needs_review", "代理人によらない法人出願は代表者氏名を記載"));
  }
  if (app.co_applicant_stakeholder_ids.length) {
    const ids = app.co_applicant_stakeholder_ids.join(", ");
    items.push(check(CO_APPLICANTS_META, "needs_review", `stakeholder_id ${ids} の名称・住所を人間が転記`));
  }
  return items;
}

function inventorCheck(app: PatentApplication): PatentCheckItem {
  const meta = { id: "inventors", label: "発明者の氏名及び住所又は居所", legal_basis: "特許法36条1項2号" };
  if (!app.inventor_stakeholder_ids.length) return check(meta, "ng", "inventor_stakeholder_ids が空");
  return check(meta, "needs_review", `L2 台帳から人間が転記（stakeholder_id: ${app.inventor_stakeholder_ids.join(", ")}）`);
}

function referenceNumberCheck(referenceNumber: string | undefined): PatentCheckItem {
  const meta = { id: "reference-number", label: "【整理番号】の形式", legal_basis: "様式第26 備考6" };
  if (!referenceNumber?.trim()) return check(meta, "ok", "未設定（任意）");
  return isValidReferenceNumber(referenceNumber)
    ? check(meta, "ok", referenceNumber)
    : check(meta, "ng", `${referenceNumber} — 大文字ローマ字・数字・「－」で10字以下`);
}

function filingWindowCheck(
  meta: CheckMeta,
  filingDate: string | undefined,
  window: FilingWindow,
  holidayExtensionVerified: boolean
): PatentCheckItem {
  if (!filingDate) return check(meta, "needs_review", "出願日（予定）未設定");
  const outcome = filingOutcome(assessFilingDate(filingDate, window), window, holidayExtensionVerified);
  return check(meta, toCheckStatus(outcome.status), `${filingDate}: ${outcome.detail}`);
}

function priorityChecks(app: PatentApplication, calendar: HolidayCalendar): PatentCheckItem[] {
  const filingDate = app.filed_on ?? app.planned_filing_on;
  return app.priority_claims.flatMap((claim, index) => {
    const meta = {
      id: `priority-window-${index + 1}`,
      label: `優先期間内の出願（基礎 ${claim.base_filed_on}）`,
      legal_basis: claim.kind === "paris" ? "パリ条約4条C" : "特許法41条1項1号",
    };
    const window = priorityWindow(claim, calendar);
    return [
      filingWindowCheck(meta, filingDate, window, isHolidayExtensionVerified(claim)),
      priorityDetailsCheck(claim, index),
    ];
  });
}

function priorityDetailsCheck(claim: PatentPriorityClaim, index: number): PatentCheckItem {
  if (claim.kind === "paris") {
    const meta = { id: `priority-details-${index + 1}`, label: "【パリ条約による優先権等の主張】の記載事項", legal_basis: "様式第26 備考27 · 特許法43条" };
    return claim.base_country ? check(meta, "ok", claim.base_country) : check(meta, "ng", "base_country（【国・地域名】）が未設定");
  }
  const meta = { id: `priority-details-${index + 1}`, label: "【先の出願に基づく優先権主張】の記載事項", legal_basis: "様式第26 備考28" };
  return claim.base_application_no
    ? check(meta, "ok", claim.base_application_no)
    : check(meta, "needs_review", "出願番号が未通知なら先の出願の整理番号を記載");
}

function noveltyFilingCheck(app: PatentApplication, disclosure: PatentDisclosure, index: number, calendar: HolidayCalendar): PatentCheckItem {
  const meta = { id: `novelty-window-${index + 1}`, label: `公開日から1年以内の出願（公開 ${disclosure.disclosed_on}）`, legal_basis: disclosure.against_will ? "特許法30条1項" : "特許法30条2項" };
  if (isExcludedFromNoveltyException(disclosure)) return check(meta, "ng", "公報掲載による公開は30条2項括弧書により適用対象外");
  const filingDate = app.filed_on ?? app.planned_filing_on;
  return filingWindowCheck(meta, filingDate, noveltyWindow(disclosure, calendar), isHolidayExtensionVerified(null));
}

function noveltyCertificateCheck(app: PatentApplication, disclosure: PatentDisclosure, index: number, input: PatentChecklistInput): PatentCheckItem {
  const meta = { id: `novelty-certificate-${index + 1}`, label: "証明書の提出（出願日から30日以内）", legal_basis: "特許法30条3項" };
  if (disclosure.against_will) return check(meta, "needs_review", "30条1項（意に反する公開）— 意に反する事実の立証資料を準備");
  if (!app.filed_on) return check(meta, "needs_review", "出願前 — 出願人の手引きに沿って証明書を準備");
  const deadline = procedureDeadline(statutoryDaysEnd(app.filed_on, NOVELTY_CERTIFICATE_DAYS), input.calendar);
  const outcome = submissionOutcome(deadline, disclosure.certificate_submitted_on, input.asOf, "30条4項の救済可否を確認");
  return check(meta, toCheckStatus(outcome.status), `期限 ${deadline.due} · ${outcome.detail}`);
}

function noveltyChecks(input: PatentChecklistInput): PatentCheckItem[] {
  return input.app.disclosures.flatMap((disclosure, index) => [
    noveltyFilingCheck(input.app, disclosure, index, input.calendar),
    noveltyCertificateCheck(input.app, disclosure, index, input),
  ]);
}

function titleCheck(spec: PatentSpecification): PatentCheckItem {
  const meta = { id: "spec-title", label: "【発明の名称】", legal_basis: "特許法36条3項1号 · 様式第29 備考4・13" };
  if (!spec.invention_title.trim()) return check(meta, "ng", "invention_title が空");
  return HALF_WIDTH_PATTERN.test(spec.invention_title)
    ? check(meta, "ng", "発明の名称に半角文字を用いない（様式第29 備考4）")
    : check(meta, "ok", spec.invention_title);
}

function detailedDescriptionCheck(spec: PatentSpecification): PatentCheckItem {
  const meta = { id: "spec-detailed-description", label: "発明の詳細な説明（技術分野・課題・解決手段・実施形態）", legal_basis: "特許法36条3項3号 · 施行規則24条の2 · 様式第29 備考14" };
  const required: Array<[string, string]> = [
    ["technical_field", spec.technical_field],
    ["problem", spec.problem],
    ["solution", spec.solution],
    ["embodiments", spec.embodiments],
  ];
  const missing = required.filter(([, value]) => !value.trim()).map(([key]) => key);
  return issuesCheck(meta, missing.map((key) => `${key} が空`), "必須見出しの入力あり");
}

function drawingChecks(spec: PatentSpecification): PatentCheckItem[] {
  const drawingsMeta = { id: "drawings", label: "必要な図面", legal_basis: "特許法36条2項" };
  const descriptionMeta = { id: "spec-drawing-description", label: "【図面の簡単な説明】", legal_basis: "特許法36条3項2号" };
  if (!spec.drawings.length) {
    return [check(drawingsMeta, "needs_review", "図面なし — 図面が必要な発明か人間確認"), check(descriptionMeta, "ok", "図面なし")];
  }
  const blank = spec.drawings.filter((d) => !d.description.trim()).map((d) => `図${d.figure_no} の説明が空`);
  return [check(drawingsMeta, "ok", `${spec.drawings.length} 図`), issuesCheck(descriptionMeta, blank, "全図に説明あり")];
}

function priorArtCheck(spec: PatentSpecification): PatentCheckItem {
  const meta = { id: "prior-art-information", label: "文献公知発明に関する情報の所在", legal_basis: "特許法36条4項2号" };
  const count = spec.prior_art_documents.patent.length + spec.prior_art_documents.non_patent.length;
  return count
    ? check(meta, "ok", `${count} 件`)
    : check(meta, "needs_review", "出願時に知っている文献公知発明があれば記載が必要");
}

const CLAIMS_BASIS = "施行規則24条の3";
const CLAIMS_PRESENT_META = { id: "claims-present", label: "特許請求の範囲（請求項）", legal_basis: "特許法36条2項・5項" };
const CLAIMS_NUMBERING_META = { id: "claims-numbering", label: "請求項番号が記載順の連続番号", legal_basis: `${CLAIMS_BASIS}第1号・第2号` };
const CLAIMS_REFERENCES_META = { id: "claims-references", label: "引用先の存在と記載順", legal_basis: `${CLAIMS_BASIS}第3号・第4号` };
const CLAIMS_TEXT_META = { id: "claims-text-references", label: "本文の引用番号と refers_to の整合", legal_basis: `${CLAIMS_BASIS}第3号` };
const CLAIMS_MULTI_META = { id: "claims-multiple-dependency", label: "マルチマルチクレームがない", legal_basis: `${CLAIMS_BASIS}第5号` };

function claimChecks(claims: readonly PatentClaim[]): PatentCheckItem[] {
  return [
    claims.length
      ? check(CLAIMS_PRESENT_META, "ok", `${claims.length} 項`)
      : check(CLAIMS_PRESENT_META, "ng", "請求項がない"),
    issuesCheck(CLAIMS_NUMBERING_META, findClaimNumberingIssues(claims), "連続番号"),
    issuesCheck(CLAIMS_REFERENCES_META, findClaimReferenceIssues(claims), "引用関係 OK"),
    issuesCheck(CLAIMS_TEXT_META, findClaimTextReferenceMismatches(claims), "整合"),
    issuesCheck(CLAIMS_MULTI_META, findMultipleDependencyIssues(claims), "該当なし"),
  ];
}

function abstractChecks(spec: PatentSpecification): PatentCheckItem[] {
  const lengthMeta = { id: "abstract-length", label: `要約は${ABSTRACT_MAX_CHARS}字以内`, legal_basis: "特許法36条7項 · 様式第31 備考11ロ" };
  const figureMeta = { id: "abstract-selected-figure", label: "【選択図】", legal_basis: "様式第31 備考13 · 施行規則25条の2" };
  const chars = countAbstractChars(spec.abstract.text);
  const lengthItem = !chars
    ? check(lengthMeta, "ng", "要約が空")
    : check(lengthMeta, chars <= ABSTRACT_MAX_CHARS ? "ok" : "ng", `${chars} 字`);
  const figures = new Set(spec.drawings.map((d) => d.figure_no));
  const selected = spec.abstract.selected_figure;
  if (!figures.size) {
    return [lengthItem, selected === undefined ? check(figureMeta, "ok", "【選択図】なし") : check(figureMeta, "ng", `図面がないのに図${selected}を指定`)];
  }
  if (selected === undefined) return [lengthItem, check(figureMeta, "ng", "図面ありのため選択図を1つ指定")];
  return [lengthItem, figures.has(selected) ? check(figureMeta, "ok", `図${selected}`) : check(figureMeta, "ng", `図${selected}は drawings にない`)];
}

function specificationChecks(app: PatentApplication, spec: PatentSpecification | null): PatentCheckItem[] {
  const meta = { id: "documents", label: "明細書・特許請求の範囲・要約書の入力", legal_basis: "特許法36条2項" };
  if (!spec) return [check(meta, "ng", `specifications/${app.id}.yaml がない`)];
  if (spec.application_id !== app.id) return [check(meta, "ng", `application_id ${spec.application_id} が ${app.id} と不一致`)];
  return [
    check(meta, "ok", `specifications/${app.id}.yaml`),
    titleCheck(spec),
    detailedDescriptionCheck(spec),
    ...drawingChecks(spec),
    priorArtCheck(spec),
    ...claimChecks(spec.claims),
    ...abstractChecks(spec),
  ];
}

function substantiveReviewCheck(): PatentCheckItem {
  const meta = { id: "substantive-review", label: "記載要件・特許性の実体判断", legal_basis: "特許法29条 · 36条4項1号 · 36条6項" };
  return check(meta, "needs_review", "実施可能要件・サポート要件・明確性・新規性・進歩性は弁理士等が判断（本チェックは形式面のみ）");
}

export function buildPatentChecklist(input: PatentChecklistInput): PatentCheckItem[] {
  return [
    jurisdictionCheck(input.jurisdictionCode),
    ...applicantChecks(input.app, input.applicant),
    inventorCheck(input.app),
    referenceNumberCheck(input.app.reference_number),
    ...priorityChecks(input.app, input.calendar),
    ...noveltyChecks(input),
    ...specificationChecks(input.app, input.specification),
    substantiveReviewCheck(),
  ];
}

export function summarizeChecklist(items: readonly PatentCheckItem[]): PatentChecklistSummary {
  const ng = items.filter((i) => i.status === "ng").length;
  const needsReview = items.filter((i) => i.status === "needs_review").length;
  const counts = { ng, needs_review: needsReview, ok: items.length - ng - needsReview };
  if (ng) return { overall: "ng", ...counts };
  return { overall: needsReview ? "needs_review" : "ok", ...counts };
}
