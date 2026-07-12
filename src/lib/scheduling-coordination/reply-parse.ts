import type {
  SchedulingParticipantResponse,
  SchedulingProposedSlot,
} from "../../../schemas/executive/scheduling-cases.js";
import type { ScheduleCounterSlot } from "../../../schemas/correspondence/mail-interpretation.js";

export interface ParsedScheduleReply {
  response: Exclude<SchedulingParticipantResponse, "pending">;
  slot_ids: string[];
  counter_slots: ScheduleCounterSlot[];
  confidence: number;
  dissent: string[];
  needs_review: boolean;
  /** Backward-compatible aliases. */
  accepted_slot_ids: string[];
  note?: string;
  counter_dates: string[];
}

const ACCEPT_PATTERNS = [
  /問題(?:あり)?ません/,
  /(?:大丈夫|可能|参加(?:できます|可能)|承知)/,
  /\bOK\b/i,
  /(?:はい|可)(?:[。、]|$)/,
  /その(?:日程|日時)で(?:お願い|結構)/,
];

const DECLINE_PATTERNS = [
  /(?:都合(?:が)?(?:悪|つか)|参加(?:でき|不可)|難しい)/,
  /\bNG\b/i,
  /(?:いいえ|不可)(?:[。、]|$)/,
  /別(?:の)?(?:日|日程)/,
];

const COUNTER_PATTERNS = [/代わりに/, /以下(?:の)?(?:日程|候補)/, /(?:別途|他に)(?:ご)?提案/];

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function extractIsoDates(text: string): string[] {
  const found: string[] = [];
  const iso = text.matchAll(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/g);
  for (const m of iso) {
    const mm = m[2]!.padStart(2, "0");
    const dd = m[3]!.padStart(2, "0");
    found.push(`${m[1]}-${mm}-${dd}`);
  }
  const jp = text.matchAll(/(\d{1,2})月(\d{1,2})日/g);
  const year = new Date().getFullYear();
  for (const m of jp) {
    const mm = m[1]!.padStart(2, "0");
    const dd = m[2]!.padStart(2, "0");
    found.push(`${year}-${mm}-${dd}`);
  }
  return [...new Set(found)];
}

function extractCounterSlots(text: string, dates: string[]): ScheduleCounterSlot[] {
  const times = [...text.matchAll(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$|[。、])/g)].map(
    (m) => `${m[1]!.padStart(2, "0")}:${m[2]}`
  );
  return dates.map((date, index) => {
    const time = times[index] ?? (times.length === 1 ? times[0] : undefined);
    return {
      start: time ? `${date}T${time}` : date,
      label: time ? `${date} ${time}` : date,
    };
  });
}

function slotDateKey(start: string): string {
  return start.slice(0, 10);
}

function slotTimeKey(start: string): string {
  return start.includes("T") ? start.slice(11, 16) : "";
}

export function matchSlotsInText(
  text: string,
  slots: SchedulingProposedSlot[]
): SchedulingProposedSlot[] {
  const dates = extractIsoDates(text);
  const matched: SchedulingProposedSlot[] = [];
  for (const slot of slots) {
    const day = slotDateKey(slot.start);
    if (dates.includes(day)) {
      matched.push(slot);
      continue;
    }
    const time = slotTimeKey(slot.start);
    if (time && text.includes(time) && text.includes(day.slice(5).replace("-", "/"))) {
      matched.push(slot);
    }
  }
  return matched;
}

export function parseScheduleReplyText(
  text: string,
  slots: SchedulingProposedSlot[] = []
): ParsedScheduleReply {
  const body = normalizeText(text);
  const matchedSlots = matchSlotsInText(body, slots);
  const counterDates = extractIsoDates(body).filter(
    (d) => !slots.some((s) => slotDateKey(s.start) === d)
  );

  const hasAccept = matchesAny(body, ACCEPT_PATTERNS);
  const hasDecline = matchesAny(body, DECLINE_PATTERNS);
  const hasCounter = matchesAny(body, COUNTER_PATTERNS) || counterDates.length > 0;
  const dissent: string[] = [];
  let response: ParsedScheduleReply["response"] = "unknown";
  if (hasCounter) {
    response = "counter";
  } else if (hasAccept && hasDecline) {
    dissent.push("regex contains both accept and decline signals");
  } else if (hasDecline) {
    response = "decline";
  } else if (hasAccept || matchedSlots.length > 0) {
    response = "accept";
  }

  const slot_ids = response === "accept" ? matchedSlots.map((s) => s.id) : [];
  const counter_slots = response === "counter" ? extractCounterSlots(body, counterDates) : [];
  const confidence =
    response === "unknown"
      ? 0.25
      : dissent.length
        ? 0.4
        : response === "accept" && !slot_ids.length
          ? 0.75
          : 0.9;

  let note: string | undefined;
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length) {
    note = lines.slice(0, 3).join(" ").slice(0, 200);
  }

  return {
    response,
    slot_ids,
    counter_slots,
    confidence,
    dissent,
    needs_review: response === "unknown" || confidence < 0.67 || dissent.length > 0,
    accepted_slot_ids: slot_ids,
    note,
    counter_dates: counterDates,
  };
}

export function extractEmailAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m?.[1] ?? from).trim().toLowerCase();
}
