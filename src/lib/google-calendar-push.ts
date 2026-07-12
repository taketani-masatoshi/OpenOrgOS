import type { CalendarEvent } from "../../schemas/executive.js";
import { parseExecutiveDateTime } from "./executive-calendar.js";
import { createHash } from "node:crypto";

export interface GoogleCalendarConfig {
  calendarId: string;
  accessToken: string;
  timeZone?: string;
}

export interface GoogleCalendarPushOptions {
  dryRun?: boolean;
  addMeet?: boolean;
  from?: string;
  to?: string;
}

export interface GoogleCalendarPushResult {
  created: number;
  updated: number;
  skipped: number;
  dryRun: boolean;
  events: Array<{
    id: string;
    action: "create" | "update" | "skip";
    googleEventId?: string;
    meetUrl?: string;
  }>;
}

function toRfc3339(
  iso: string,
  timeZone = "Asia/Tokyo"
): { dateTime: string; timeZone: string } | { date: string } {
  if (iso.length <= 10) {
    return { date: iso };
  }
  const d = parseExecutiveDateTime(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = "+09:00";
  const dateTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`;
  return { dateTime, timeZone };
}

export function buildGoogleCalendarEventBody(
  event: CalendarEvent,
  opts?: { addMeet?: boolean }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: event.title,
    description: event.notes ?? undefined,
    location: event.location ?? undefined,
    start: toRfc3339(event.start),
    end: toRfc3339(event.end),
    extendedProperties: {
      private: {
        stewardEventId: event.id,
        stewardSource: "orgos-reference",
      },
    },
  };

  if (
    opts?.addMeet &&
    (event.type === "meeting" || event.type === "one_on_one" || event.type === "external") &&
    !event.location
  ) {
    body.conferenceData = {
      createRequest: {
        requestId: `${event.id}-meet-v1`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return body;
}

export function loadGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const accessToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN ?? process.env.GOOGLE_ACCESS_TOKEN;
  if (!calendarId || !accessToken) return null;
  return {
    calendarId,
    accessToken,
    timeZone: process.env.GOOGLE_CALENDAR_TIMEZONE ?? "Asia/Tokyo",
  };
}

async function googleCalendarFetch(
  config: GoogleCalendarConfig,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>
): Promise<Response> {
  const url = new URL(`https://www.googleapis.com/calendar/v3${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function pushEventToGoogleCalendar(
  config: GoogleCalendarConfig,
  event: CalendarEvent,
  googleEventId: string | undefined,
  opts?: { addMeet?: boolean; dryRun?: boolean }
): Promise<{
  action: "create" | "update" | "skip";
  googleEventId?: string;
  meetUrl?: string;
}> {
  if (event.status === "cancelled") {
    return { action: "skip" };
  }

  const body = buildGoogleCalendarEventBody(event, opts);
  const cal = encodeURIComponent(config.calendarId);

  if (opts?.dryRun) {
    return { action: googleEventId ? "update" : "create", googleEventId: googleEventId ?? "(new)" };
  }

  if (googleEventId) {
    const res = await googleCalendarFetch(
      config,
      "PATCH",
      `/calendars/${cal}/events/${encodeURIComponent(googleEventId)}`,
      body,
      opts?.addMeet ? { conferenceDataVersion: "1" } : undefined
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Google Calendar PATCH ${event.id}: HTTP ${res.status} ${text.slice(0, 200)}`
      );
    }
    const data = (await res.json()) as { id: string; hangoutLink?: string };
    return { action: "update", googleEventId: data.id, meetUrl: data.hangoutLink };
  }

  // A deterministic, Google-compatible id makes a retry after an uncertain POST
  // response converge on the same remote event.
  const deterministicId = `orgos${createHash("sha256").update(event.id).digest("hex").slice(0, 32)}`;
  const res = await googleCalendarFetch(
    config,
    "POST",
    `/calendars/${cal}/events`,
    { ...body, id: deterministicId },
    opts?.addMeet ? { conferenceDataVersion: "1" } : undefined
  );
  if (res.status === 409) {
    return pushEventToGoogleCalendar(config, event, deterministicId, opts);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar POST ${event.id}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; hangoutLink?: string };
  return {
    action: "create",
    googleEventId: data.id,
    meetUrl: data.hangoutLink,
  };
}

export async function pushCalendarToGoogle(
  events: CalendarEvent[],
  opts?: GoogleCalendarPushOptions & { config?: GoogleCalendarConfig }
): Promise<{ result: GoogleCalendarPushResult; events: CalendarEvent[] }> {
  const config = opts?.config ?? loadGoogleCalendarConfig();
  const dryRun = opts?.dryRun ?? false;

  if (!dryRun && !config) {
    throw new Error(
      "Google Calendar 未設定 — GOOGLE_CALENDAR_ID + GOOGLE_CALENDAR_ACCESS_TOKEN（.env）または --dry-run"
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const details: GoogleCalendarPushResult["events"] = [];
  const updatedEvents = [...events];

  for (let i = 0; i < updatedEvents.length; i++) {
    const event = updatedEvents[i]!;
    if (event.status === "cancelled") {
      skipped++;
      details.push({ id: event.id, action: "skip" });
      continue;
    }
    if (opts?.from && eventDateBefore(event, opts.from)) continue;
    if (opts?.to && eventDateAfter(event, opts.to)) continue;

    if (dryRun) {
      const action = event.google_event_id ? "update" : "create";
      if (action === "create") created++;
      else updated++;
      details.push({
        id: event.id,
        action,
        googleEventId: event.google_event_id ?? "(new)",
      });
      continue;
    }

    const push = await pushEventToGoogleCalendar(config!, event, event.google_event_id, {
      addMeet: opts?.addMeet,
    });

    if (push.action === "skip") {
      skipped++;
    } else if (push.action === "create") {
      created++;
      if (push.googleEventId) {
        updatedEvents[i] = {
          ...event,
          google_event_id: push.googleEventId,
          meet_url: push.meetUrl ?? event.meet_url,
        };
      }
    } else {
      updated++;
      updatedEvents[i] = {
        ...event,
        google_event_id: push.googleEventId ?? event.google_event_id,
        meet_url: push.meetUrl ?? event.meet_url,
      };
    }
    details.push({
      id: event.id,
      action: push.action,
      googleEventId: push.googleEventId,
      meetUrl: push.meetUrl,
    });
  }

  return {
    result: {
      created,
      updated,
      skipped,
      dryRun,
      events: details,
    },
    events: updatedEvents,
  };
}

function eventDateBefore(e: CalendarEvent, from: string): boolean {
  return e.start.slice(0, 10) < from;
}

function eventDateAfter(e: CalendarEvent, to: string): boolean {
  return e.start.slice(0, 10) > to;
}

function eventDateKey(event: CalendarEvent): string {
  return event.start.slice(0, 10);
}

// re-export for tests
export { eventDateKey };
