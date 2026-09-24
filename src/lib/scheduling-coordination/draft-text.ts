import type {
  SchedulingCase,
  SchedulingParticipant,
} from "../../../schemas/executive/scheduling-cases.js";
import { loadCompany } from "../data.js";
import { loadVenueCatalog } from "../venue-booking/store.js";
import { loadSecretaryDraftTone } from "../secretary/tenant-behavior.js";
import {
  companyDisplayName,
  fillStyleTemplate,
  loadCorrespondenceStyle,
  resolveCorrespondenceLocale,
} from "../correspondence/style-resolve.js";
import { nextActionLabel } from "./next-action.js";
import { extractSchedulingCostLine } from "./meal-cost.js";
import { buildSchedulingConfirmText } from "./draft-text-confirm.js";
import { formatJapaneseSlotLabel } from "./draft-text-format.js";
import {
  joinSchedulingDraftLines,
  sanitizeSchedulingDraftBody,
} from "./draft-text-lines.js";
import type { DraftTextParts } from "./draft-text-parts.js";
import { buildSchedulingProposalText } from "./draft-text-proposal.js";
import { buildSchedulingReminderText } from "./draft-text-reminder.js";

export {
  formatJapaneseSlotLabel,
  joinSchedulingDraftLines,
  sanitizeSchedulingDraftBody,
};

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

export type SchedulingDraftKind = SchedulingCase["correspondence"][number]["kind"];

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

function isEnglishLocale(locale: string): boolean {
  return locale.startsWith("en");
}

function buildDraftTextParts(
  caseRow: SchedulingCase,
  targetParticipant?: SchedulingParticipant
): DraftTextParts {
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

  return {
    caseRow,
    targetParticipant,
    subjectBase,
    tone,
    style,
    en,
    slots,
    greeting,
    opener,
    selfIntro,
    signature,
    formatLabel,
    purposeLine,
    cost: extractSchedulingCostLine(caseRow),
    access: extractAccessLine(caseRow),
  };
}

export function buildSchedulingDraftText(
  caseRow: SchedulingCase,
  kind: SchedulingDraftKind,
  targetParticipant?: SchedulingParticipant
): { subject: string; body: string } {
  const parts = buildDraftTextParts(caseRow, targetParticipant);
  if (kind === "proposal") return buildSchedulingProposalText(parts);
  if (kind === "reminder") return buildSchedulingReminderText(parts);
  if (kind === "confirm") return buildSchedulingConfirmText(parts);
  // clarify is owned by clarify-text.ts; fall through to confirm-shaped body for legacy callers
  return buildSchedulingConfirmText(parts);
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
