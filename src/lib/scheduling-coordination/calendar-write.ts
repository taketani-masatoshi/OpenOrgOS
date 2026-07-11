import { join } from "node:path";
import type { CalendarEvent } from "../../../schemas/executive.js";
import { calendarEventSchema, calendarFileSchema } from "../../../schemas/executive.js";
import type { SchedulingCase } from "../../../schemas/executive/scheduling-cases.js";
import { loadExecutiveCalendar } from "../data.js";
import {
  loadGoogleCalendarConfig,
  pushEventToGoogleCalendar,
} from "../google-calendar-push.js";
import { getExecutiveDir, writeYamlFile } from "../utils.js";
import { applyNextAction } from "./next-action.js";
import { findSchedulingCase, updateSchedulingCase } from "./store.js";

function nextCalendarEventId(events: CalendarEvent[]): string {
  const max = events.reduce((current, event) => {
    const value = event.id.match(/^EVT-(\d+)$/)?.[1];
    return value ? Math.max(current, Number(value)) : current;
  }, 0);
  return `EVT-${String(max + 1).padStart(3, "0")}`;
}

function saveCalendar(events: CalendarEvent[]): void {
  const path = join(getExecutiveDir(), "calendar.yaml");
  const current = loadExecutiveCalendar();
  writeYamlFile(path, calendarFileSchema.parse({ ...current, events }));
}

export function ensureCalendarEventForCase(
  caseRow: SchedulingCase,
  slotId: string
): { caseRow: SchedulingCase; event: CalendarEvent } {
  const slot = caseRow.proposed_slots.find((candidate) => candidate.id === slotId);
  if (!slot) throw new Error(`Slot ${slotId} not found`);

  const calendar = loadExecutiveCalendar();
  const eventId = caseRow.linked_event_id ?? nextCalendarEventId(calendar.events);
  let event = calendar.events.find((candidate) => candidate.id === eventId);
  if (!event) {
    event = calendarEventSchema.parse({
      id: eventId,
      title: caseRow.title,
      type: "meeting",
      start: slot.start,
      end: slot.end,
      location: caseRow.location,
      attendees: caseRow.participants.map((participant) => participant.name),
      status: "confirmed",
      external_visible: true,
    });
    saveCalendar([...calendar.events, event]);
  }

  const latest = findSchedulingCase(caseRow.id) ?? caseRow;
  if (
    latest.linked_event_id === eventId &&
    latest.calendar_sync === "synced" &&
    event.google_event_id
  ) {
    return { caseRow: latest, event };
  }

  const updated = updateSchedulingCase(latest.id, latest.revision, (current) =>
    applyNextAction({
      ...current,
      status: "confirmed",
      pending_slot_id: slotId,
      linked_event_id: eventId,
      calendar_sync: "pending",
      calendar_sync_error: undefined,
      updated_at: new Date().toISOString(),
    })
  );
  return { caseRow: updated, event };
}

export async function syncSchedulingCaseCalendar(
  caseId: string,
  slotId: string,
  opts?: { pushGoogle?: boolean }
): Promise<SchedulingCase> {
  const initial = findSchedulingCase(caseId);
  if (!initial) throw new Error(`Case ${caseId} not found`);
  const ensured = ensureCalendarEventForCase(initial, slotId);
  if (opts?.pushGoogle === false) return ensured.caseRow;

  if (ensured.caseRow.calendar_sync === "synced" && ensured.event.google_event_id) {
    return ensured.caseRow;
  }

  const syncing = updateSchedulingCase(
    ensured.caseRow.id,
    ensured.caseRow.revision,
    (current) => ({
      ...current,
      calendar_sync: "syncing",
      calendar_sync_error: undefined,
      updated_at: new Date().toISOString(),
    })
  );

  try {
    const config = loadGoogleCalendarConfig();
    if (!config) {
      throw new Error(
        "Google Calendar 未設定 — GOOGLE_CALENDAR_ID + GOOGLE_CALENDAR_ACCESS_TOKEN が必要です"
      );
    }
    const pushed = await pushEventToGoogleCalendar(
      config,
      ensured.event,
      ensured.event.google_event_id,
      { addMeet: syncing.meeting_format === "online" }
    );
    const calendar = loadExecutiveCalendar();
    const events = calendar.events.map((event) =>
      event.id === ensured.event.id
        ? {
            ...event,
            google_event_id: pushed.googleEventId ?? event.google_event_id,
            meet_url: pushed.meetUrl ?? event.meet_url,
          }
        : event
    );
    saveCalendar(events);
    return updateSchedulingCase(syncing.id, syncing.revision, (current) =>
      applyNextAction({
        ...current,
        calendar_sync: "synced",
        calendar_sync_error: undefined,
        calendar_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateSchedulingCase(syncing.id, syncing.revision, (current) =>
      applyNextAction({
        ...current,
        status: "confirmed",
        calendar_sync: "failed",
        calendar_sync_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
    );
    throw error;
  }
}
