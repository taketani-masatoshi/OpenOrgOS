import type { SchedulingProposedSlot } from "../../../schemas/executive/scheduling-cases.js";
import type {
  MailInterpretVote,
  ScheduleCounterSlot,
  ScheduleReplyResponse,
} from "../../../schemas/correspondence/mail-interpretation.js";
import { findMailInterpretation } from "../correspondence/mail-interpretation.js";
import { parseScheduleReplyText, type ParsedScheduleReply } from "./reply-parse.js";

interface ScheduleVote {
  source: string;
  response: ScheduleReplyResponse;
  slot_ids: string[];
  counter_slots: ScheduleCounterSlot[];
  confidence: number;
}

function fromMailVote(vote: MailInterpretVote, slots: SchedulingProposedSlot[]): ScheduleVote {
  const parsed = parseScheduleReplyText(vote.summary_l1, slots);
  return {
    source: vote.model,
    response: vote.response ?? parsed.response,
    slot_ids: vote.slot_ids ?? parsed.slot_ids,
    counter_slots: vote.counter_slots ?? parsed.counter_slots,
    confidence: vote.confidence,
  };
}

function aggregateVotes(votes: ScheduleVote[], fallback: ParsedScheduleReply): ParsedScheduleReply {
  const counts = new Map<ScheduleReplyResponse, number>();
  for (const vote of votes) counts.set(vote.response, (counts.get(vote.response) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const tied = ranked.length > 1 && ranked[0]![1] === ranked[1]![1];
  const winner = tied ? "unknown" : (ranked[0]?.[0] ?? "unknown");
  const supporting = votes.filter((v) => v.response === winner);
  const agreement = supporting.length / Math.max(votes.length, 1);
  const confidence =
    supporting.length > 0
      ? supporting.reduce((sum, v) => sum + v.confidence, 0) / supporting.length
      : 0;
  const dissent = votes
    .filter((v) => v.response !== winner)
    .map((v) => `${v.source}:${v.response}`);
  if (tied) dissent.unshift("response vote tie");
  const slot_ids = [...new Set(supporting.flatMap((v) => v.slot_ids))];
  const counter_slots = supporting.flatMap((v) => v.counter_slots);
  const needs_review =
    winner === "unknown" || confidence < 0.67 || agreement < 1 || dissent.length > 0;

  return {
    ...fallback,
    response: winner,
    slot_ids,
    counter_slots,
    confidence,
    dissent,
    needs_review,
    accepted_slot_ids: slot_ids,
    counter_dates: counter_slots.map((s) => s.start.slice(0, 10)),
  };
}

/** regex を独立した1票として mail interpretation votes と決定論的に統合する。 */
export function interpretScheduleReply(
  text: string,
  slots: SchedulingProposedSlot[] = [],
  mailId?: string
): ParsedScheduleReply {
  const regex = parseScheduleReplyText(text, slots);
  if (!mailId) return regex;

  const interp = findMailInterpretation(mailId);
  if (!interp || interp.intent !== "schedule") return regex;

  const votes: ScheduleVote[] = [
    {
      source: "regex",
      response: regex.response,
      slot_ids: regex.slot_ids,
      counter_slots: regex.counter_slots,
      confidence: regex.confidence,
    },
    ...interp.votes.map((vote) => fromMailVote(vote, slots)),
  ];
  if (!interp.votes.length) {
    const legacy = parseScheduleReplyText(interp.summary_l1, slots);
    votes.push({
      source: "interpretation",
      response: interp.response ?? legacy.response,
      slot_ids: interp.slot_ids ?? legacy.slot_ids,
      counter_slots: interp.counter_slots ?? legacy.counter_slots,
      confidence: interp.confidence ?? interp.agreement,
    });
  }
  return aggregateVotes(votes, regex);
}
