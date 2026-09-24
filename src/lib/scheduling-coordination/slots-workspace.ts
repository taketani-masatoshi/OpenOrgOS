import type { CalendarEvent } from "../../../schemas/executive.js";
import type { SchedulingProposedSlot } from "../../../schemas/executive/scheduling-cases.js";
import { loadExecutiveCalendar } from "../data.js";
import { currentDate } from "../utils.js";
import {
  proposeExecutiveSlots,
  type ProposeSlotsOptions,
} from "./slots.js";

export type ProposeWorkspaceSlotsOptions = Omit<ProposeSlotsOptions, "from" | "events"> & {
  from?: string;
  events?: CalendarEvent[];
};

/**
 * Shell: load executive calendar + default `from` from workspace clock, then call pure propose.
 */
export function proposeExecutiveSlotsFromWorkspace(
  opts: ProposeWorkspaceSlotsOptions = {}
): SchedulingProposedSlot[] {
  const from = opts.from ?? currentDate();
  let events: CalendarEvent[] = opts.events ?? [];
  if (opts.events === undefined) {
    try {
      events = loadExecutiveCalendar().events;
    } catch {
      events = [];
    }
  }
  return proposeExecutiveSlots({
    ...opts,
    from,
    events,
  });
}
