/**
 * Secretary schedule brief — what the CEO needs to hear about the calendar.
 * Path: src/lib/secretary/schedule-brief.ts
 *
 * Today's meetings plus the next confirmed external one, in a single line.
 * Deterministic: the caller supplies both the date and the events.
 */
import type { CalendarEvent } from "../../../schemas/executive.js";

const DEFAULT_UPCOMING_DAYS = 7;

/** Titles the rehearsal tooling creates; real counterparties never sit behind them. */
const REHEARSAL_TITLE = /リハーサル|rehearsal/i;

export interface SecretaryScheduleBriefInput {
  date: string;
  events: CalendarEvent[];
  upcomingDays?: number;
}

export interface SecretaryScheduleBrief {
  today: CalendarEvent[];
  upcoming: CalendarEvent[];
  headline: string;
}

function eventDate(event: CalendarEvent): string {
  return event.start.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * The one upcoming meeting worth naming. A rehearsal is only named when there
 * is nothing real to report, otherwise the brief reads as if the CEO has an
 * external meeting when they do not.
 */
function pickLead(upcoming: CalendarEvent[]): CalendarEvent | undefined {
  const real = upcoming.filter((event) => !REHEARSAL_TITLE.test(event.title));
  const pool = real.length > 0 ? real : upcoming;
  const external = pool.filter((event) => event.external_visible || event.attendees.length > 0);
  return (external.length > 0 ? external : pool)[0];
}

export function buildSecretaryScheduleBrief(
  input: SecretaryScheduleBriefInput,
): SecretaryScheduleBrief {
  const horizon = input.upcomingDays ?? DEFAULT_UPCOMING_DAYS;
  const live = input.events
    .filter((event) => event.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));

  const today = live.filter((event) => eventDate(event) === input.date);
  const upcoming = live.filter((event) => {
    if (event.status !== "confirmed") return false;
    const gap = daysBetween(input.date, eventDate(event));
    return gap > 0 && gap <= horizon;
  });

  const parts: string[] = [];
  if (today.length > 0) {
    parts.push(`本日 ${today.length} 件: ${today.map((event) => event.title).join(" / ")}`);
  } else {
    parts.push("本日の予定はありません");
  }
  const lead = pickLead(upcoming);
  if (lead) {
    parts.push(`近日確定: ${formatDay(eventDate(lead))} ${lead.title}`);
  }

  return { today, upcoming, headline: parts.join(" · ") };
}
