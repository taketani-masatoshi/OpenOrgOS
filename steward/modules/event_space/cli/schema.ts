/**
 * Co-located Zod contract for the event_space activation seeds.
 * Mirrors `steward/modules/event_space/seed/*.yaml.example`.
 */

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockTime = z.string().regex(/^\d{2}:\d{2}$/);

export const eventSpaceSpaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  capacity: z.number().int().positive().optional(),
  hourly_rate_yen: z.number().int().nonnegative().optional(),
  status: z.string().min(1),
});

export const eventSpaceSpacesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  spaces: z.array(eventSpaceSpaceSchema).default([]),
});

export const eventSpaceBookingSchema = z.object({
  id: z.string().min(1),
  space_id: z.string().min(1),
  date: isoDate,
  start_time: clockTime.optional(),
  end_time: clockTime.optional(),
  status: z.string().min(1),
});

export const eventSpaceBookingsFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  bookings: z.array(eventSpaceBookingSchema).default([]),
});

export type EventSpaceSpace = z.output<typeof eventSpaceSpaceSchema>;
export type EventSpaceBooking = z.output<typeof eventSpaceBookingSchema>;
export type EventSpaceSpacesFile = z.output<typeof eventSpaceSpacesFileSchema>;
export type EventSpaceBookingsFile = z.output<typeof eventSpaceBookingsFileSchema>;
