import { z } from "zod";
import { monthString } from "../common.js";

export const periodLockStatusSchema = z.enum(["locked", "unlocked"]);

export const periodLockEntrySchema = z.object({
  month: monthString,
  status: periodLockStatusSchema.default("locked"),
  at: z.string().min(1),
  by: z.string().min(1),
  reason: z.string().optional(),
});

export const periodLocksFileSchema = z.object({
  version: z.literal(1),
  locks: z.array(periodLockEntrySchema).default([]),
});

export type PeriodLockStatus = z.output<typeof periodLockStatusSchema>;
export type PeriodLocksFile = z.output<typeof periodLocksFileSchema>;
export type PeriodLockEntry = z.output<typeof periodLockEntrySchema>;
