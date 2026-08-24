import type { CorrespondenceDraft } from "../../../schemas/correspondence/draft.js";
import { loadCorrespondenceDraft } from "./draft.js";
import { bodyContainsMeasurementPlaceholder } from "./measurement-ref.js";
import {
  loadCorrespondenceStyle,
  resolveCorrespondenceLocale,
  type CorrespondenceStyle,
} from "./style-resolve.js";
import {
  schedulingCaseHasCostLine,
  schedulingCaseLooksLikeMeal,
} from "../scheduling-coordination/draft-text.js";
import { findSchedulingCase } from "../scheduling-coordination/store.js";

export type StyleLintSeverity = "error" | "warning";

export interface StyleLintIssue {
  id: string;
  severity: StyleLintSeverity;
  message: string;
}

export interface StyleLintResult {
  ok: boolean;
  locale: string;
  issues: StyleLintIssue[];
}

export type StyleLintKind =
  | "scheduling_clarify"
  | "scheduling_proposal"
  | "scheduling_reminder"
  | "scheduling_confirm"
  | "generic";

export function inferStyleLintKind(draft: Pick<CorrespondenceDraft, "notes" | "subject">): StyleLintKind {
  const notes = draft.notes ?? "";
  if (/kind:clarify\b/.test(notes)) return "scheduling_clarify";
  if (/kind:confirm\b/.test(notes)) return "scheduling_confirm";
  if (/kind:reminder\b/.test(notes)) return "scheduling_reminder";
  if (/kind:proposal\b/.test(notes)) return "scheduling_proposal";
  const subject = draft.subject ?? "";
  if (/日程確定/.test(subject)) return "scheduling_confirm";
  if (/日程調整/.test(subject)) return "scheduling_proposal";
  return "generic";
}

function hasSelfIntro(body: string, companyHint?: string): boolean {
  if (/の秘書です[。．]?/.test(body)) return true;
  if (/secretary/i.test(body) && /on behalf of|from\s+/i.test(body)) return true;
  if (companyHint && body.includes(companyHint) && /秘書/.test(body)) return true;
  return false;
}

function hasAddressee(body: string): boolean {
  const first = body.trim().split(/\n/)[0] ?? "";
  return /様\s*$/.test(first) || /御中\s*$/.test(first) || /^(Dear|Hi|Hello)\b/i.test(first);
}

function hasJapaneseClosing(body: string): boolean {
  return /よろしくお願い(申し上げ)?ます|何卒よろしく|お手数ですがご回答/.test(body);
}

/** 署名ブロック: 社名行と「秘書」行が分かれているか（1行「株式会社X 秘書」は不可） */
function hasJaSecretarySignatureBlock(body: string): boolean {
  const lines = body
    .trimEnd()
    .split(/\n/)
    .map((l) => l.trimEnd());
  // trailing blank ok
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  if (lines.length < 2) return false;
  const last = lines[lines.length - 1]!.trim();
  const prev = lines[lines.length - 2]!.trim();
  if (last === "秘書" && /株式会社/.test(prev)) return true;
  if (/^Secretary$/i.test(last) && prev.length > 0) return true;
  return false;
}

function hasBlankLineAfterAddressee(body: string): boolean {
  const lines = body.replace(/^\uFEFF/, "").split(/\n/);
  if (lines.length < 2) return false;
  const first = lines[0] ?? "";
  if (!/様\s*$/.test(first) && !/御中\s*$/.test(first)) return true; // non-ja; skip
  return (lines[1] ?? "").trim() === "";
}

function bodyHasAccessLine(body: string): boolean {
  return /アクセス\s*[:：]|駅.+徒歩|徒歩約?\d|Access\s*:/i.test(body);
}

function bodyHasCostLine(body: string): boolean {
  return /費用\s*[:：]|お一人さま|税込|ご負担|Cost\s*:|per person/i.test(body);
}

/** ISO 日付のみで、日本語「N月N日」が無い */
function hasIsoOnlyDatetime(body: string): boolean {
  const hasIso = /\d{4}-\d{2}-\d{2}/.test(body);
  const hasJa = /\d{1,2}\s*月\s*\d{1,2}\s*日/.test(body);
  return hasIso && !hasJa;
}

export function lintCorrespondenceBody(opts: {
  body: string;
  subject?: string;
  locale?: string;
  kind?: StyleLintKind;
  companyName?: string;
  meetingFormat?: "online" | "in_person" | "unspecified";
  isMeal?: boolean;
  hasCostLine?: boolean;
  style?: CorrespondenceStyle;
}): StyleLintResult {
  const locale = opts.locale ?? resolveCorrespondenceLocale();
  const style = opts.style ?? loadCorrespondenceStyle(locale);
  const issues: StyleLintIssue[] = [];
  const body = opts.body ?? "";
  const ja = locale.startsWith("ja");

  for (const phrase of style.forbidden_phrases) {
    if (phrase && body.includes(phrase)) {
      issues.push({
        id: "forbidden_phrase",
        severity: "error",
        message: `禁句「${phrase}」が含まれています`,
      });
    }
  }

  if (/送信元\s*[:：]/.test(body) || /送信元アドレス/.test(body)) {
    issues.push({
      id: "sender_explanation",
      severity: "error",
      message: "送信元説明は社外文に含めません",
    });
  }

  if (bodyContainsMeasurementPlaceholder(body)) {
    issues.push({
      id: "measurement_placeholder",
      severity: "error",
      message:
        "計測・デモ・証明用プレースホルダ（LIVE-MEASURE / HP-PROOF / REH- / PROOF- 等）は社外文に含めません",
    });
  }

  const banned = style.self_reference?.banned_first_mention_patterns ?? [];
  for (const pattern of banned) {
    if (pattern && body.includes(pattern)) {
      issues.push({
        id: "banned_self_reference",
        severity: "error",
        message: `名乗りに不適切な表現「${pattern}」があります`,
      });
    }
  }

  const kind = opts.kind ?? "generic";
  const secretaryKinds: StyleLintKind[] = [
    "scheduling_confirm",
    "scheduling_proposal",
    "scheduling_clarify",
    "scheduling_reminder",
  ];

  if (secretaryKinds.includes(kind) || (ja && kind === "generic" && /秘書です/.test(body))) {
    if (!hasAddressee(body)) {
      issues.push({
        id: "missing_addressee",
        severity: "error",
        message: "宛名（氏名+様 / 御中）がありません",
      });
    }
    if (ja && !hasBlankLineAfterAddressee(body)) {
      issues.push({
        id: "missing_blank_after_addressee",
        severity: "error",
        message: "宛名行の直後に空行が必要です（前付けと本文を分けてください）",
      });
    }
    if (!hasSelfIntro(body, opts.companyName)) {
      issues.push({
        id: "missing_self_intro",
        severity: "error",
        message: "自社名乗り（…の秘書です）がありません",
      });
    }
    if (ja && !hasJapaneseClosing(body)) {
      issues.push({
        id: "missing_closing",
        severity: "error",
        message: "結び（何卒よろしくお願い申し上げます、等）がありません",
      });
    }
    if (ja && !hasJaSecretarySignatureBlock(body)) {
      issues.push({
        id: "signature_not_block",
        severity: "error",
        message: "署名は「株式会社…」行と「秘書」行の2行にしてください（同一行不可）",
      });
    }
  }

  if (kind === "scheduling_clarify") {
    if (!/【会場案】|Venue options/i.test(body)) {
      issues.push({
        id: "missing_venue_options",
        severity: "error",
        message: "clarify 文に会場案ブロックがありません",
      });
    }
    if (/・日時\s*[:：]|日時\s*[:：]\s*\S|Date\s*\/\s*Time\s*:/i.test(body)) {
      issues.push({
        id: "clarify_has_datetime",
        severity: "error",
        message: "候補日提示前 clarify に日時を含めません",
      });
    }
    if (/アレルギー|allerg/i.test(body)) {
      issues.push({
        id: "clarify_allergy_line",
        severity: "warning",
        message: "アレルギーは相手 DB 正本 — clarify 文に含めない",
      });
    }
    const areaLine = body.match(/・エリア\s*[:：]\s*(.+)/)?.[1]?.trim();
    if (areaLine && /店|亭|膳|寮|今半|なだ万|会席|個室/.test(areaLine) && !/駅|区|市|都|府|県|周辺|エリア/.test(areaLine)) {
      issues.push({
        id: "area_looks_like_venue",
        severity: "warning",
        message: "エリア行に店舗名らしき表記があります（地名・駅圏にしてください）",
      });
    }
  }

  if (kind === "scheduling_confirm") {
    if (!/日時|Date\s*\/\s*Time|when:/i.test(body)) {
      issues.push({
        id: "missing_datetime",
        severity: "error",
        message: "確定文に日時がありません",
      });
    }
    if (ja && hasIsoOnlyDatetime(body)) {
      issues.push({
        id: "datetime_not_localized",
        severity: "error",
        message: "日時は「7月15日（水）18:00–19:00」形式にしてください（ISOのみ不可）",
      });
    }
    if (opts.meetingFormat === "in_person") {
      if (!/会場|場所|Venue|Location/i.test(body)) {
        issues.push({
          id: "missing_venue",
          severity: "error",
          message: "対面確定文に会場がありません",
        });
      }
      if (!bodyHasAccessLine(body)) {
        issues.push({
          id: "missing_access",
          severity: "error",
          message: "対面確定文にアクセス（駅・徒歩分）がありません",
        });
      }
      if (/追って\s*(ご)?連絡/.test(body) && !/会場|場所/.test(body.split(/追って/)[0] ?? "")) {
        issues.push({
          id: "venue_deferred_only",
          severity: "error",
          message: "会場未定のまま「追って連絡」だけでは確定送信できません",
        });
      }
    }
  }

  if (opts.isMeal && (opts.hasCostLine === false || (opts.hasCostLine !== true && !bodyHasCostLine(body)))) {
    const mealSeverity: StyleLintSeverity =
      kind === "scheduling_confirm" || kind === "scheduling_proposal" ? "error" : "warning";
    issues.push({
      id: "meal_cost_missing",
      severity: mealSeverity,
      message: "会食・祝いの社外文に費用目安（負担）がありません",
    });
  }

  if (locale.startsWith("ja") && kind !== "generic") {
    const orgWord = style.other_reference?.organization ?? "貴社";
    if (kind === "scheduling_proposal" && !body.includes(orgWord) && !/貴社/.test(body)) {
      if (/趣旨|目的|としてご調整/.test(body)) {
        issues.push({
          id: "missing_other_org_ref",
          severity: "warning",
          message: `相手組織への敬称（${orgWord}）がありません`,
        });
      }
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    locale,
    issues,
  };
}

export function formatStyleLintReport(result: StyleLintResult): string {
  const lines = [`style-lint (${result.locale}) · ${result.ok ? "PASS" : "FAIL"}`];
  for (const issue of result.issues) {
    lines.push(`  [${issue.severity}] ${issue.id}: ${issue.message}`);
  }
  return lines.join("\n");
}

export function lintCorrespondenceDraft(
  draftId: string,
  opts?: { locale?: string; companyName?: string; meetingFormat?: "online" | "in_person" | "unspecified" }
): StyleLintResult {
  const draft = loadCorrespondenceDraft(draftId);
  let meetingFormat = opts?.meetingFormat;
  let isMeal: boolean | undefined;
  let hasCostLine: boolean | undefined;
  const caseId = draft.notes?.match(/scheduling-case:(SCH-\d{4}-\d{3})/)?.[1];
  if (caseId) {
    try {
      const sch = findSchedulingCase(caseId);
      meetingFormat = meetingFormat ?? sch?.meeting_format;
      if (sch) {
        isMeal = schedulingCaseLooksLikeMeal(sch);
        hasCostLine = schedulingCaseHasCostLine(sch);
      }
    } catch {
      /* optional when not in tenant fixture */
    }
  }
  if (isMeal && /費用\s*[:：]|お一人さま|税込|Cost\s*:/i.test(draft.body)) {
    hasCostLine = true;
  }
  return lintCorrespondenceBody({
    body: draft.body,
    subject: draft.subject,
    locale: opts?.locale ?? resolveCorrespondenceLocale({ contactRef: draft.contact_ref }),
    kind: inferStyleLintKind(draft),
    companyName: opts?.companyName,
    meetingFormat,
    isMeal,
    hasCostLine,
  });
}

export class CorrespondenceStyleLintError extends Error {
  readonly result: StyleLintResult;

  constructor(result: StyleLintResult) {
    const summary = result.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("; ");
    super(
      `Correspondence style lint failed (${result.locale}): ${summary}\n${formatStyleLintReport(result)}`
    );
    this.name = "CorrespondenceStyleLintError";
    this.result = result;
  }
}

/**
 * 秘書・Mail Outbound の社外メール送信前に必須。
 * error があれば送信不可（warn のみは可）。
 */
export function assertCorrespondenceStyleLint(
  draft: Pick<CorrespondenceDraft, "body" | "subject" | "notes" | "contact_ref">,
  opts?: {
    companyName?: string;
    meetingFormat?: "online" | "in_person" | "unspecified";
    isMeal?: boolean;
    hasCostLine?: boolean;
  }
): StyleLintResult {
  const result = lintCorrespondenceBody({
    body: draft.body,
    subject: draft.subject,
    locale: resolveCorrespondenceLocale({ contactRef: draft.contact_ref }),
    kind: inferStyleLintKind(draft),
    companyName: opts?.companyName,
    meetingFormat: opts?.meetingFormat,
    isMeal: opts?.isMeal,
    hasCostLine: opts?.hasCostLine,
  });
  if (!result.ok) throw new CorrespondenceStyleLintError(result);
  return result;
}
