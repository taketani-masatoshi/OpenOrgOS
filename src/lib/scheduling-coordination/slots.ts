import type { CalendarEvent } from "../../../schemas/executive.js";
import type { SchedulingProposedSlot } from "../../../schemas/executive/scheduling-cases.js";
import { loadExecutiveCalendar } from "../data.js";
import { currentDate } from "../utils.js";
import { nextSlotId } from "./store.js";
import {
  detectCalendarConflicts,
  filterEventsInRange,
  parseExecutiveDateTime,
  addDays as addCalendarDays,
} from "../executive-calendar.js";

const DEFAULT_SLOT_HOURS = [10, 11, 14, 15, 16];

function formatSlotLabel(start: string, end: string): string {
  const s = start.includes("T") ? start.slice(0, 16).replace("T", " ") : start;
  const e = end.includes("T") ? end.slice(11, 16) : "";
  return e ? `${s}–${e}` : s;
}

function overlapsExisting(startMs: number, endMs: number, events: CalendarEvent[]): boolean {
  for (const e of events) {
    if (e.status === "cancelled") continue;
    const eStart = parseExecutiveDateTime(e.start).getTime();
    const eEnd = parseExecutiveDateTime(e.end).getTime();
    if (startMs < eEnd && eStart < endMs) return true;
  }
  return false;
}

function isWeekday(isoDate: string): boolean {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export interface ProposeSlotsOptions {
  from?: string;
  to?: string;
  count?: number;
  durationMinutes?: number;
  existingSlots?: SchedulingProposedSlot[];
}

export function proposeExecutiveSlots(opts: ProposeSlotsOptions = {}): SchedulingProposedSlot[] {
  const from = opts.from ?? currentDate();
  const to = opts.to ?? addCalendarDays(from, 14);
  const count = opts.count ?? 3;
  const durationMinutes = opts.durationMinutes ?? 60;
  const existing = opts.existingSlots ?? [];

  let events: CalendarEvent[];
  try {
    events = loadExecutiveCalendar().events;
  } catch {
    events = [];
  }

  const rangeEvents = filterEventsInRange(events, from, to);
  const conflicts = detectCalendarConflicts(rangeEvents);
  if (conflicts.length) {
    // conflicts inform overlap check via events list
  }

  const proposed: SchedulingProposedSlot[] = [];
  let day = from;

  while (proposed.length < count && day <= to) {
    if (isWeekday(day)) {
      for (const hour of DEFAULT_SLOT_HOURS) {
        if (proposed.length >= count) break;
        const start = `${day}T${String(hour).padStart(2, "0")}:00`;
        const endDate = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`);
        endDate.setMinutes(endDate.getMinutes() + durationMinutes);
        const end = `${day}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
        const startMs = parseExecutiveDateTime(start).getTime();
        const endMs = parseExecutiveDateTime(end).getTime();
        if (overlapsExisting(startMs, endMs, rangeEvents)) continue;
        proposed.push({
          id: nextSlotId([...existing, ...proposed]),
          start,
          end,
          label: formatSlotLabel(start, end),
        });
      }
    }
    day = addCalendarDays(day, 1);
  }

  return proposed;
}

export function findUnanimousAcceptedSlot(
  participants: { response: string; accepted_slot_id?: string }[],
  slots: SchedulingProposedSlot[]
): SchedulingProposedSlot | undefined {
  if (!slots.length) return undefined;
  const active = participants.filter((p) => p.response !== "decline");
  if (!active.length) return undefined;

  for (const slot of slots) {
    const allAccept = active.every(
      (p) => p.response === "accept" && p.accepted_slot_id === slot.id
    );
    if (allAccept) return slot;
  }

  const acceptCounts = new Map<string, number>();
  for (const p of active) {
    if (p.response === "accept" && p.accepted_slot_id) {
      acceptCounts.set(p.accepted_slot_id, (acceptCounts.get(p.accepted_slot_id) ?? 0) + 1);
    }
  }
  let bestId: string | undefined;
  let bestCount = 0;
  for (const [slotId, n] of acceptCounts) {
    if (n > bestCount) {
      bestCount = n;
      bestId = slotId;
    }
  }
  if (bestId && bestCount === active.length) {
    return slots.find((s) => s.id === bestId);
  }
  return undefined;
}
