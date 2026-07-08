import type { CalendarEvent } from "../../schemas/executive.js";
import { loadGoogleCalendarConfig } from "./google-calendar-push.js";
import { parseExecutiveDateTime } from "./executive-calendar.js";

export interface GoogleCalendarPullOptions {
  since?: string;
  dryRun?: boolean;
}

export interface GoogleCalendarPullResult {
  linked: number;
  external: number;
  dryRun: boolean;
  linkedEvents: Array<{ yamlId: string; googleEventId: string }>;
  externalEvents: Array<{ googleEventId: string; summary: string; start: string }>;
}

interface GoogleEventItem {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

async function listGoogleEvents(
  config: NonNullable<ReturnType<typeof loadGoogleCalendarConfig>>,
  since: string
): Promise<GoogleEventItem[]> {
  const cal = encodeURIComponent(config.calendarId);
  const timeMin = `${since}T00:00:00+09:00`;
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar list: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { items?: GoogleEventItem[] };
  return data.items ?? [];
}

function googleStartIso(item: GoogleEventItem): string {
  const dt = item.start?.dateTime ?? item.start?.date;
  return dt?.slice(0, 16) ?? "";
}

export async function pullCalendarFromGoogle(
  yamlEvents: CalendarEvent[],
  opts?: GoogleCalendarPullOptions
): Promise<{ result: GoogleCalendarPullResult; events: CalendarEvent[] }> {
  const since = opts?.since ?? new Date().toISOString().slice(0, 10);
  const dryRun = opts?.dryRun ?? true;
  const config = loadGoogleCalendarConfig();

  if (!dryRun && !config) {
    throw new Error(
      "Google Calendar 未設定 — GOOGLE_CALENDAR_ID + GOOGLE_CALENDAR_ACCESS_TOKEN（.env）または --dry-run"
    );
  }

  const byId = new Map(yamlEvents.map((e) => [e.id, e]));
  const linkedEvents: GoogleCalendarPullResult["linkedEvents"] = [];
  const externalEvents: GoogleCalendarPullResult["externalEvents"] = [];
  const updated = [...yamlEvents];

  if (!config) {
    return {
      result: { linked: 0, external: 0, dryRun, linkedEvents, externalEvents },
      events: updated,
    };
  }

  const googleItems = dryRun ? [] : await listGoogleEvents(config, since);

  for (const item of googleItems) {
    const stewardId = item.extendedProperties?.private?.stewardEventId;
    const start = googleStartIso(item);
    if (stewardId && byId.has(stewardId)) {
      const idx = updated.findIndex((e) => e.id === stewardId);
      if (idx >= 0 && !updated[idx]!.google_event_id) {
        linkedEvents.push({ yamlId: stewardId, googleEventId: item.id });
        if (!dryRun) {
          updated[idx] = { ...updated[idx]!, google_event_id: item.id };
        }
      }
      continue;
    }
    externalEvents.push({
      googleEventId: item.id,
      summary: item.summary ?? "(無題)",
      start,
    });
  }

  return {
    result: {
      linked: linkedEvents.length,
      external: externalEvents.length,
      dryRun,
      linkedEvents,
      externalEvents,
    },
    events: updated,
  };
}

/** 将来イベントで YAML にのみ存在（pull 差分候補） */
export function yamlOnlyFutureEvents(events: CalendarEvent[], since: string): CalendarEvent[] {
  const sinceMs = parseExecutiveDateTime(since).getTime();
  return events.filter(
    (e) =>
      e.status !== "cancelled" &&
      !e.google_event_id &&
      parseExecutiveDateTime(e.start).getTime() >= sinceMs
  );
}
