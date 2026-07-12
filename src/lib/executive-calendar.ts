import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CalendarEvent, OneOnOne, ExecutiveTask } from "../../schemas/executive.js";
import { loadExecutiveCalendar } from "./data.js";
import { getExecutiveDir, currentDate } from "./utils.js";

export function parseExecutiveDateTime(iso: string): Date {
  if (iso.length <= 10) return new Date(`${iso}T00:00:00`);
  return new Date(iso);
}

export function eventDateKey(event: CalendarEvent): string {
  return event.start.slice(0, 10);
}

export function isActiveEvent(event: CalendarEvent): boolean {
  return event.status !== "cancelled";
}

export function filterEventsInRange(
  events: CalendarEvent[],
  from: string,
  to: string
): CalendarEvent[] {
  const fromMs = parseExecutiveDateTime(from).getTime();
  const toMs = parseExecutiveDateTime(to + "T23:59:59").getTime();
  return events
    .filter(isActiveEvent)
    .filter((e) => {
      const start = parseExecutiveDateTime(e.start).getTime();
      return start >= fromMs && start <= toMs;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface CalendarConflict {
  a: CalendarEvent;
  b: CalendarEvent;
  overlapMinutes: number;
}

export function detectCalendarConflicts(events: CalendarEvent[]): CalendarConflict[] {
  const active = events.filter(isActiveEvent);
  const conflicts: CalendarConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      const aStart = parseExecutiveDateTime(a.start).getTime();
      const aEnd = parseExecutiveDateTime(a.end).getTime();
      const bStart = parseExecutiveDateTime(b.start).getTime();
      const bEnd = parseExecutiveDateTime(b.end).getTime();
      if (aStart < bEnd && bStart < aEnd) {
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        conflicts.push({
          a,
          b,
          overlapMinutes: Math.max(0, Math.round((overlapEnd - overlapStart) / 60_000)),
        });
      }
    }
  }
  return conflicts;
}

export function formatEventLine(event: CalendarEvent): string {
  const day = eventDateKey(event);
  const start = event.start.includes("T") ? event.start.slice(11, 16) : "終日";
  const end = event.end.includes("T") ? event.end.slice(11, 16) : "";
  const time = end && start !== "終日" ? `${start}–${end}` : start;
  return `${day} ${time}  ${event.title} [${event.type}/${event.status}]`;
}

export function requireExecutiveCalendar(): CalendarEvent[] {
  const path = join(getExecutiveDir(), "calendar.yaml");
  if (!existsSync(path)) {
    throw new Error("data/executive/calendar.yaml 未作成 — cp calendar.yaml.example calendar.yaml");
  }
  return loadExecutiveCalendar().events;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatLocalDate(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

export function weekRange(referenceDate = currentDate()): { from: string; to: string } {
  const from = mondayOfWeek(referenceDate);
  return { from, to: addDays(from, 6) };
}

export function openTasks(tasks: ExecutiveTask[]): ExecutiveTask[] {
  return tasks
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .sort((a, b) => {
      const prio = { p0: 0, p1: 1, p2: 2, p3: 3 };
      return prio[a.priority] - prio[b.priority] || (a.due ?? "").localeCompare(b.due ?? "");
    });
}

export function upcomingOneOnOnes(entries: OneOnOne[], withinDays = 14): OneOnOne[] {
  const today = currentDate();
  const limit = addDays(today, withinDays);
  return entries.filter((o) => o.next_date && o.next_date >= today && o.next_date <= limit);
}
