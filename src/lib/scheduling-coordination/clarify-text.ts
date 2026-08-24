import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { loadCompany } from "../data.js";
import {
  companyDisplayName,
  fillStyleTemplate,
  loadCorrespondenceStyle,
  resolveCorrespondenceLocale,
} from "../correspondence/style-resolve.js";
import { getJurisdictionPackRoot, resolveJurisdictionCode } from "../jurisdiction.js";
import { loadSecretaryDraftTone } from "../secretary/tenant-behavior.js";
import { joinSchedulingDraftLines, sanitizeSchedulingDraftBody } from "./draft-text.js";

function isEnglishLocale(locale: string): boolean {
  return locale.startsWith("en");
}

/** 候補日前 clarify 専用テンプレ（日時・アレルギーなし） */
function clarifyPreProposalTemplatePath(locale: string): string | undefined {
  const pack = locale.startsWith("en") ? "US" : "JP";
  try {
    const code = resolveJurisdictionCode(pack);
    const dir = join(getJurisdictionPackRoot(code), "correspondence", "templates");
    const preferred = locale.startsWith("en")
      ? "scheduling-clarify-pre-proposal-en.md"
      : "scheduling-clarify-pre-proposal-ja.md";
    const full = join(dir, preferred);
    if (existsSync(full)) return full;
    const ja = join(dir, "scheduling-clarify-pre-proposal-ja.md");
    return existsSync(ja) ? ja : undefined;
  } catch {
    return undefined;
  }
}

/**
 * テンプレ本文を抽出。
 * 1) fenced ``` ブロック優先
 * 2) なければ最初の宛名行〜「### 規則」直前まで（フェンス非依存）
 */
export function extractCorrespondenceTemplateBody(raw: string): string | undefined {
  const fenced = raw.match(/```(?:[a-zA-Z0-9_-]*)?\r?\n([\s\S]*?)```/);
  if (fenced?.[1]?.trim()) return fenced[1].trim();

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex(
    (line) =>
      /\{[a-z0-9_]+\}/i.test(line) ||
      /様\s*$/.test(line.trim()) ||
      /^Dear\s+/i.test(line.trim())
  );
  if (start < 0) return undefined;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i]!) || /^---+\s*$/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start, end).join("\n").trim();
  return body || undefined;
}

function loadClarifyPreProposalTemplate(locale: string): string | undefined {
  const path = clarifyPreProposalTemplatePath(locale);
  if (!path || !existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf-8");
  return extractCorrespondenceTemplateBody(raw);
}

function factsSuffix(facts: string | undefined): string {
  const trimmed = facts?.trim();
  return trimmed ? ` — ${trimmed}` : "";
}

function formatVenueBlock(caseRow: SchedulingCase, en: boolean): string[] {
  const lines: string[] = [];
  if (!caseRow.venue_options.length) return lines;
  lines.push(
    en
      ? "【Venue options】 (please let us know your preference; we will arrange)"
      : "【会場案】（ご希望をお知らせください。弊社にて手配いたします）"
  );
  for (const option of caseRow.venue_options) {
    const suffix = option.first_pick ? (en ? " [preferred]" : "【第一候補】") : "";
    const facts = option.facts ? ` — ${option.facts}` : "";
    lines.push(`${option.id}. ${option.name}${facts}${suffix}`);
  }
  return lines;
}

/**
 * 候補日提示**前**の clarify（趣旨 + 会場3案のみ）。
 * アレルギー行は相手 DB 正本のため含めない。
 * 正本テンプレ: `scheduling-clarify-pre-proposal-ja.md`（strip しない）。
 */
export function buildSchedulingClarifyText(
  caseRow: SchedulingCase,
  targetParticipant?: SchedulingParticipant
): { subject: string; body: string } {
  const locale = resolveCorrespondenceLocale({
    contactRef: targetParticipant?.contact_ref,
    email: targetParticipant?.email,
  });
  const style = loadCorrespondenceStyle(locale);
  const tone = loadSecretaryDraftTone();
  let companyLegal = "当社";
  try {
    companyLegal = loadCompany().name;
  } catch {
    /* fixture */
  }
  const company = companyDisplayName(companyLegal);
  const en = isEnglishLocale(locale);

  const greeting = targetParticipant?.name
    ? en
      ? `Dear ${targetParticipant.name},`
      : `${targetParticipant.name} 様`
    : en
      ? "Dear Sir or Madam,"
      : "ご担当者様";

  const opener = style.opener?.standard?.trim() || (en ? "" : "お世話になっております。");
  const selfIntro =
    fillStyleTemplate(style.self_reference?.first_mention ?? "株式会社{company}の秘書です。", {
      company_short_or_legal: company,
      company,
    }) || (en ? `I am writing on behalf of ${companyLegal}.` : `株式会社${company}の秘書です。`);
  const signature =
    (
      fillStyleTemplate(style.signature?.default ?? "株式会社{company}\n秘書", {
        company_short_or_legal: company,
        company,
      }) || (en ? `${companyLegal}` : `株式会社${company}\n秘書`)
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();
  const closing =
    style.closings?.request?.trim() ||
    tone.proposalClosing ||
    (en ? "Thank you," : "何卒よろしくお願い申し上げます。");

  const purpose = caseRow.purpose?.trim() ?? "";
  const purposeLine = purpose
    ? en
      ? `We would like to arrange a meeting regarding ${purpose}.`
      : `今回は貴社との${purpose}としてご調整できればと存じます。`
    : en
      ? "We would like to arrange a meeting with you."
      : "今回は貴社とのお打合せとしてご調整できればと存じます。";

  const areaRaw = caseRow.venue_area?.trim();
  const locationLooksLikeVenue = caseRow.venue_options.some(
    (o) => o.name === caseRow.location?.trim()
  );
  const areaFromFacts = (() => {
    const first =
      caseRow.venue_options.find((o) => o.first_pick) ?? caseRow.venue_options[0];
    const station = first?.facts?.match(/([^\s・]+駅)/)?.[1];
    return station ? `${station}周辺` : undefined;
  })();
  const area =
    areaRaw ||
    (!locationLooksLikeVenue ? caseRow.location?.trim() : undefined) ||
    areaFromFacts ||
    undefined;
  const areaLine =
    area && en ? `Area: ${area}` : area ? `・エリア: ${area}` : undefined;
  const cost = caseRow.cost_estimate?.trim();
  const costLine =
    cost && en ? `Cost: ${cost}` : cost ? `・費用: ${cost}` : undefined;

  const optionA = caseRow.venue_options.find((o) => o.id === "A");
  const optionB = caseRow.venue_options.find((o) => o.id === "B");
  const optionC = caseRow.venue_options.find((o) => o.id === "C");

  const template = loadClarifyPreProposalTemplate(locale);
  if (template) {
    const formatVenueName = (option: typeof optionA): string => option?.name ?? "";
    const formatFacts = (option: typeof optionA): string => {
      if (!option) return "";
      const facts = factsSuffix(option.facts);
      const pick = option.first_pick ? (en ? " [preferred]" : "【第一候補】") : "";
      return `${facts}${pick}`;
    };
    const filled = fillStyleTemplate(template, {
      full_name: targetParticipant?.name ?? (en ? "Sir or Madam" : "ご担当者"),
      company,
      purpose_confirmed: purpose || (en ? "a meeting" : "お打合せ"),
      area: area ?? (en ? "(to be confirmed)" : "（ご相談）"),
      cost_line: costLine ?? "",
      venue_a: formatVenueName(optionA),
      venue_a_facts_suffix: formatFacts(optionA),
      venue_b: formatVenueName(optionB),
      venue_b_facts_suffix: formatFacts(optionB),
      venue_c: formatVenueName(optionC),
      venue_c_facts_suffix: formatFacts(optionC),
    });
    return {
      subject: en ? `[Venue options] ${caseRow.title}` : `【会場のご相談】${caseRow.title}`,
      body: sanitizeSchedulingDraftBody(filled),
    };
  }

  const body = sanitizeSchedulingDraftBody(
    joinSchedulingDraftLines([
      greeting,
      "",
      opener || undefined,
      selfIntro,
      "",
      purposeLine,
      "",
      en ? "We are considering the following venues:" : "下記会場案をご検討いただけますと幸いです。",
      "",
      ...formatVenueBlock(caseRow, en),
      areaLine,
      costLine,
      "",
      en
        ? "Please share your preferred option. We will follow up with specific date/time proposals."
        : "ご希望の会場をお知らせください。日程のご提案は改めてご連絡いたします。",
      "",
      closing,
      "",
      signature,
    ])
  );

  return {
    subject: en ? `[Venue options] ${caseRow.title}` : `【会場のご相談】${caseRow.title}`,
    body,
  };
}

export function hashCorrespondenceBody(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex");
}
