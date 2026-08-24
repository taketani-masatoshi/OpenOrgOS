import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { loadCompany, loadExecutiveCalendar } from "../data.js";
import { findVenueReservation, loadVenueCatalog } from "../venue-booking/store.js";
import { loadSecretaryDraftTone } from "../secretary/tenant-behavior.js";
import {
  companyDisplayName,
  fillStyleTemplate,
  loadCorrespondenceStyle,
  resolveCorrespondenceLocale,
} from "../correspondence/style-resolve.js";
import { nextActionLabel } from "./next-action.js";

function formatSlotLines(caseRow: SchedulingCase, localizedJa = false): string {
  if (!caseRow.proposed_slots.length) return "（候補未設定）";
  return caseRow.proposed_slots
    .map((s, i) => {
      const label = localizedJa
        ? formatJapaneseSlotLabel(s.start, s.end)
        : (s.label ?? `${s.start}–${s.end}`);
      return `${i + 1}. ${label}`;
    })
    .join("\n");
}

function formatParticipantStatus(caseRow: SchedulingCase): string {
  return caseRow.participants
    .map((p) => {
      const slot =
        p.accepted_slot_id &&
        caseRow.proposed_slots.find((s) => s.id === p.accepted_slot_id)?.label;
      return `- ${p.name}: ${p.response}${slot ? ` (${slot})` : ""}`;
    })
    .join("\n");
}

export type SchedulingDraftKind = "clarify" | "proposal" | "reminder" | "confirm";

export function sanitizeSchedulingDraftBody(body: string): string {
  return body
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^送信元\s*[:：]/.test(t)) return false;
      if (/送信元\s*[:：]\s*\S+@\S+/.test(t)) return false;
      if (/\(送信元:/.test(t) || /（送信元:/.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 意図した空行を保持して結合する（`.filter(Boolean)` は空文字を落とすため使わない）。
 * `undefined` / `false` のみ省略。
 */
export function joinSchedulingDraftLines(
  lines: Array<string | false | undefined | null>
): string {
  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

function extractAccessLine(caseRow: SchedulingCase): string | undefined {
  const notes = caseRow.notes ?? "";
  const fromNotes = notes.match(/アクセス[:：]\s*(.+)/)?.[1]?.trim();
  if (fromNotes) return fromNotes;
  const loc = caseRow.location ?? "";
  const fromLoc = loc.match(/（([^）]*徒歩[^）]*)）/)?.[1]?.trim();
  if (fromLoc) return fromLoc;
  const first = caseRow.venue_options?.find((o) => o.first_pick) ?? caseRow.venue_options?.[0];
  if (first?.facts && /徒歩|駅/.test(first.facts)) {
    return first.facts;
  }
  try {
    const catalog = loadVenueCatalog();
    const name = caseRow.location ?? first?.name;
    const hit = catalog?.venues.find((v) => name && v.name === name);
    if (hit?.station) {
      const walk =
        hit.walking_minutes_from_station != null
          ? ` 徒歩約${hit.walking_minutes_from_station}分`
          : "";
      return `${hit.station}駅${walk}`.trim();
    }
  } catch {
    /* optional */
  }
  return undefined;
}

/** 社外確定・提案用の日本語日時ラベル（曜日付き） */
export function formatJapaneseSlotLabel(start: string, end?: string): string {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return start;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = m[4];
  const mm = m[5];
  const week = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, mo - 1, d).getDay()] ?? "";
  const datePart = `${mo}月${d}日（${week}）`;
  if (!hh || !mm) return datePart;
  let endPart = "";
  if (end) {
    const em = end.match(/(?:[T ](\d{2}):(\d{2}))/);
    if (em) endPart = `–${em[1]}:${em[2]}`;
  }
  return `${datePart} ${hh}:${mm}${endPart}`;
}

function extractCostLine(
  caseRow: Pick<SchedulingCase, "cost_estimate" | "notes">
): string | undefined {
  if (caseRow.cost_estimate?.trim()) return caseRow.cost_estimate.trim();
  const notes = caseRow.notes ?? "";
  return notes.match(/費用[:：]\s*(.+)/)?.[1]?.trim();
}

/** 会食らしさ（費用 WARN 用）— title/purpose/notes のヒューリスティック */
export function schedulingCaseLooksLikeMeal(
  caseRow: Pick<SchedulingCase, "title" | "purpose" | "notes" | "meeting_format">
): boolean {
  if (caseRow.meeting_format !== "in_person") return false;
  const text = `${caseRow.title} ${caseRow.purpose ?? ""} ${caseRow.notes ?? ""}`;
  return /会食|ランチ|昼食|dinner|lunch|食事|懇親|祝い|祝宴|宴会/i.test(text);
}

export function schedulingCaseHasCostLine(
  caseRow: Pick<SchedulingCase, "cost_estimate" | "notes">
): boolean {
  return Boolean(extractCostLine(caseRow));
}

export class SchedulingMealCostRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchedulingMealCostRequiredError";
  }
}

/** 会食の proposal/confirm 起案前に cost_estimate（または notes 費用行）を必須化 */
export function assertMealCostForOutboundDraft(
  caseRow: Pick<
    SchedulingCase,
    "id" | "title" | "purpose" | "notes" | "meeting_format" | "cost_estimate"
  >,
  kind: SchedulingDraftKind
): void {
  if (kind !== "proposal" && kind !== "confirm") return;
  if (!schedulingCaseLooksLikeMeal(caseRow)) return;
  if (schedulingCaseHasCostLine(caseRow)) return;
  throw new SchedulingMealCostRequiredError(
    `${caseRow.id}: 会食・祝いの ${kind} 起案には cost_estimate（または notes の「費用: …」）が必須です。` +
      `例: npm run orgos -- executive scheduling set-cost --id ${caseRow.id} --estimate "お一人さま税込12,000円前後を目安とし、当方にてご負担いたします"`
  );
}

function isEnglishLocale(locale: string): boolean {
  return locale.startsWith("en");
}

export function buildSchedulingDraftText(
  caseRow: SchedulingCase,
  kind: SchedulingDraftKind,
  targetParticipant?: SchedulingParticipant
): { subject: string; body: string } {
  const subjectBase = caseRow.title;
  const tone = loadSecretaryDraftTone();
  const locale = resolveCorrespondenceLocale({
    contactRef: targetParticipant?.contact_ref,
    email: targetParticipant?.email,
  });
  const style = loadCorrespondenceStyle(locale);
  let companyLegal = "当社";
  try {
    companyLegal = loadCompany().name;
  } catch {
    /* fixtures may omit company.yaml */
  }
  const company = companyDisplayName(companyLegal);
  const en = isEnglishLocale(locale);
  const slots = formatSlotLines(caseRow, !en);

  const greeting = targetParticipant?.name
    ? en
      ? `Dear ${targetParticipant.name},`
      : `${targetParticipant.name} 様`
    : en
      ? "Dear Sir or Madam,"
      : "ご担当者様";

  const opener = style.opener?.standard?.trim() || (en ? "" : "お世話になっております。");
  const selfIntro =
    fillStyleTemplate(style.self_reference?.first_mention ?? "株式会社{company_short_or_legal}の秘書です。", {
      company_short_or_legal: company,
      company,
    }) || (en ? `I am writing on behalf of ${companyLegal}.` : `株式会社${company}の秘書です。`);
  const signatureRaw =
    fillStyleTemplate(
      style.signature?.default ?? "株式会社{company_short_or_legal}\n秘書",
      {
        company_short_or_legal: company,
        company,
      }
    ) || (en ? `${companyLegal}` : `株式会社${company}\n秘書`);
  const signature = signatureRaw.replace(/\r\n/g, "\n").trimEnd();

  const formatLabel = en
    ? caseRow.meeting_format === "online"
      ? "Online"
      : caseRow.meeting_format === "in_person"
        ? "In person"
        : undefined
    : caseRow.meeting_format === "online"
      ? "オンライン"
      : caseRow.meeting_format === "in_person"
        ? "対面"
        : undefined;

  const purposeLine = caseRow.purpose?.trim()
    ? en
      ? `Purpose: ${caseRow.purpose.trim()}`
      : `今回は貴社との${caseRow.purpose.trim()}としてご調整できればと存じます。`
    : "";

  const cost = extractCostLine(caseRow);
  const access = extractAccessLine(caseRow);

  if (kind === "proposal") {
    const closing =
      tone.proposalClosing ||
      style.closings?.request?.trim() ||
      (en ? "Thank you," : "何卒よろしくお願い申し上げます。");
    return {
      subject: en ? `[Scheduling] ${subjectBase}` : `【日程調整】${subjectBase}`,
      body: sanitizeSchedulingDraftBody(
        joinSchedulingDraftLines([
          greeting,
          "",
          opener || undefined,
          selfIntro,
          "",
          en
            ? `Regarding ${subjectBase}, please let us know which of the following times work for you.`
            : `${subjectBase}につき、下記候補日時からご都合をお知らせください。`,
          purposeLine || undefined,
          "",
          slots,
          formatLabel ? (en ? `Format: ${formatLabel}` : `形式: ${formatLabel}`) : undefined,
          caseRow.meeting_format === "in_person" && caseRow.location
            ? en
              ? `Location: ${caseRow.location}`
              : `場所: ${caseRow.location}`
            : undefined,
          caseRow.meeting_format === "in_person" && access
            ? en
              ? `Access: ${access}`
              : `アクセス: ${access}`
            : undefined,
          cost
            ? en
              ? `Cost: ${cost}`
              : `・費用: ${cost}`
            : undefined,
          "",
          closing,
          "",
          signature,
        ])
      ),
    };
  }

  if (kind === "reminder") {
    const pending = caseRow.participants
      .filter((p) => p.response === "pending")
      .map((p) => p.name)
      .join(en ? ", " : "、");
    const closing =
      tone.reminderClosing ||
      style.closings?.request?.trim() ||
      (en ? "Thank you," : "何卒よろしくお願い申し上げます。");
    return {
      subject: en ? `Re: [Scheduling] ${subjectBase}` : `Re: 【日程調整】${subjectBase}`,
      body: sanitizeSchedulingDraftBody(
        joinSchedulingDraftLines([
          greeting,
          "",
          opener || undefined,
          selfIntro,
          "",
          en
            ? `We are following up on scheduling for ${subjectBase}.`
            : `${subjectBase} の日程調整について、ご回答をお待ちしております。`,
          pending && !targetParticipant
            ? en
              ? `(Awaiting: ${pending})`
              : `（未回答: ${pending}）`
            : undefined,
          "",
          en ? "Proposed times:" : "候補日時:",
          slots,
          "",
          en ? "Please let us know your availability." : "ご都合をお知らせください。",
          "",
          closing,
          "",
          signature,
        ])
      ),
    };
  }

  const slot =
    caseRow.proposed_slots.find((s) =>
      caseRow.participants.every(
        (p) => p.response !== "accept" || p.accepted_slot_id === s.id
      )
    ) ?? caseRow.proposed_slots[0];
  const calendarEvent = caseRow.linked_event_id
    ? loadExecutiveCalendar().events.find((event) => event.id === caseRow.linked_event_id)
    : undefined;
  const datetimeLabel = slot
    ? en
      ? (slot.label ?? `${slot.start}–${slot.end}`)
      : formatJapaneseSlotLabel(slot.start, slot.end)
    : slots;
  const thanks = style.opener?.reply_thanks?.trim() || (en ? "Thank you for your reply." : "ご返信ありがとうございました。");
  // 正本 style.yaml の結びを優先（テナント短縮形より品格を優先）
  const closing =
    style.closings?.confirm?.trim() ||
    tone.confirmClosing ||
    (en ? "We look forward to meeting you." : "当日は何卒よろしくお願い申し上げます。");
  const meetingLines: string[] = [];
  if (caseRow.meeting_format === "online") {
    if (calendarEvent?.meet_url) {
      meetingLines.push(en ? `Join URL: ${calendarEvent.meet_url}` : `参加URL: ${calendarEvent.meet_url}`);
    } else {
      meetingLines.push(en ? "Format: Online" : "形式: オンライン");
    }
  } else if (caseRow.location) {
    meetingLines.push(en ? `Venue: ${caseRow.location}` : `・会場: ${caseRow.location}`);
    if (access) meetingLines.push(en ? `Access: ${access}` : `・アクセス: ${access}`);
    if (cost) {
      meetingLines.push(en ? `Cost: ${cost}` : `・費用: ${cost}`);
    }
    if (caseRow.venue_reservation_id) {
      const vr = findVenueReservation(caseRow.venue_reservation_id);
      if (vr?.external_ref && vr.status === "confirmed") {
        meetingLines.push(
          en ? `Reservation ref: ${vr.external_ref}` : `・ご予約番号: ${vr.external_ref}`
        );
      }
    }
  } else if (formatLabel) {
    meetingLines.push(en ? `Format: ${formatLabel}` : `形式: ${formatLabel}`);
  }

  return {
    subject: en ? `Re: [Confirmed] ${subjectBase}` : `Re: 【日程確定】${subjectBase}`,
    body: sanitizeSchedulingDraftBody(
      joinSchedulingDraftLines([
        greeting,
        "",
        opener || undefined,
        selfIntro,
        "",
        thanks,
        en
          ? `We have confirmed the following for ${subjectBase}.`
          : "ご希望どおり、下記にて確定いたしました。",
        "",
        en ? `Date/Time: ${datetimeLabel}` : `・日時: ${datetimeLabel}`,
        ...meetingLines,
        "",
        closing,
        "",
        signature,
      ])
    ),
  };
}

export function formatSchedulingCaseSummary(caseRow: SchedulingCase): string {
  return [
    `**${caseRow.id}** ${caseRow.title} · ${caseRow.status}`,
    `次: ${nextActionLabel(caseRow.next_action)}`,
    formatParticipantStatus(caseRow),
  ].join("\n");
}

export function draftKindForNextAction(
  caseRow: SchedulingCase
): SchedulingDraftKind | undefined {
  switch (caseRow.next_action) {
    case "send_clarify":
      return "clarify";
    case "send_proposal":
      return "proposal";
    case "send_reminder":
      return "reminder";
    case "send_confirmation":
      return "confirm";
    default:
      return undefined;
  }
}
