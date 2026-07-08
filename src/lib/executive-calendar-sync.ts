import type { CalendarEvent } from "../../schemas/executive.js";
import { isActiveEvent } from "./executive-calendar.js";
import { currentDate } from "./utils.js";

/** confirmed/tentative かつ google_event_id 未設定（push 未同期） */
export function detectUnsyncedCalendarEvents(
  events: CalendarEvent[],
  opts?: { fromDate?: string }
): CalendarEvent[] {
  const from = opts?.fromDate ?? currentDate();
  return events.filter(
    (e) =>
      isActiveEvent(e) &&
      (e.status === "confirmed" || e.status === "tentative") &&
      !e.google_event_id &&
      e.start.slice(0, 10) >= from
  );
}
