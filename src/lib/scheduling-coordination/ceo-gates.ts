import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { SCHEDULE_VENUE_PENDING, SCHEDULE_VENUE_RESERVATION_PENDING } from "./venue-gate.js";

/** CEO 中間ゲート用 exception_reason（最終確定・split·counter上限以外） */
export const SCHEDULE_COUNTER_NEEDS_CEO = "schedule_counter_needs_ceo";
export const SCHEDULE_FORMAT_CHANGE = "schedule_format_change";
export const SCHEDULE_PURPOSE_UNCLEAR = "schedule_purpose_unclear";
export const SCHEDULE_IDENTITY_QUERY = "schedule_identity_query";
export const SCHEDULE_INTAKE_PENDING = "schedule_intake_pending";
export { SCHEDULE_VENUE_PENDING, SCHEDULE_VENUE_RESERVATION_PENDING };

/** 候補日提示前 · 会場3案の CEO 入力待ち */
export const SCHEDULE_VENUE_CLARIFY = "schedule_venue_clarify";

export const CEO_GATE_EXCEPTIONS = new Set([
  SCHEDULE_COUNTER_NEEDS_CEO,
  SCHEDULE_FORMAT_CHANGE,
  SCHEDULE_PURPOSE_UNCLEAR,
  SCHEDULE_IDENTITY_QUERY,
  SCHEDULE_INTAKE_PENDING,
  SCHEDULE_VENUE_PENDING,
  SCHEDULE_VENUE_CLARIFY,
  SCHEDULE_VENUE_RESERVATION_PENDING,
  "schedule_counter_limit",
  "schedule_split_accept",
]);

const FORMAT_IN_PERSON =
  /(?:対面|訪問|来社|会食|ランチ|昼食|dinner|lunch|in[\s-]?person)/i;
const FORMAT_ONLINE = /(?:オンライン|online|zoom|meet|teams|web会議|リモート)/i;
const IDENTITY_QUERY =
  /(?:どなた|誰(?:です|だ)|ご担当|どちら様|どの(?:会社|部署)|ご所属)/;
const PURPOSE_QUERY =
  /(?:定例(?:って|とは|の意味)|何(?:の|を)(?:打合|会議|MTG)|趣旨|目的(?:は|を)|どういった(?:打合|会議))/i;

export type ReplyGateSignals = {
  formatHint?: "online" | "in_person";
  identityQuery: boolean;
  purposeQuery: boolean;
  formatChange: boolean;
};

export function detectReplyGateSignals(
  body: string,
  caseRow: Pick<SchedulingCase, "meeting_format">
): ReplyGateSignals {
  const identityQuery = IDENTITY_QUERY.test(body);
  const purposeQuery = PURPOSE_QUERY.test(body);
  const wantsInPerson = FORMAT_IN_PERSON.test(body);
  const wantsOnline = FORMAT_ONLINE.test(body);
  let formatHint: "online" | "in_person" | undefined;
  if (wantsInPerson && !wantsOnline) formatHint = "in_person";
  else if (wantsOnline && !wantsInPerson) formatHint = "online";

  const formatChange =
    Boolean(formatHint) &&
    caseRow.meeting_format !== "unspecified" &&
    formatHint !== caseRow.meeting_format;

  return { formatHint, identityQuery, purposeQuery, formatChange };
}

export function resolveCounterExceptionReason(signals: ReplyGateSignals): string {
  if (signals.identityQuery) return SCHEDULE_IDENTITY_QUERY;
  if (signals.purposeQuery) return SCHEDULE_PURPOSE_UNCLEAR;
  if (signals.formatChange || signals.formatHint === "in_person") {
    return SCHEDULE_FORMAT_CHANGE;
  }
  return SCHEDULE_COUNTER_NEEDS_CEO;
}

export function isCeoGateException(reason: string | undefined): boolean {
  return Boolean(reason && CEO_GATE_EXCEPTIONS.has(reason));
}

export function caseNeedsCeoIntake(
  caseRow: Pick<SchedulingCase, "purpose" | "meeting_format" | "ceo_intake_confirmed">
): boolean {
  if (caseRow.ceo_intake_confirmed) return false;
  if (!caseRow.purpose?.trim()) return true;
  if (caseRow.meeting_format === "unspecified") return true;
  return false;
}
