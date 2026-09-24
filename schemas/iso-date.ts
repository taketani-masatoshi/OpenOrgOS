import { z } from "zod";

/** True when `value` is a real Gregorian calendar day (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** YYYY-MM-DD that exists on the calendar — shared by JP module schemas. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(isCalendarDate, { message: "not a calendar date" });

export type IsoDate = z.infer<typeof isoDate>;
