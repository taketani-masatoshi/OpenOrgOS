import { z } from "zod";

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const monthString = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

export const riskLevel = z.enum(["low", "medium", "high"]);

export type RiskLevel = z.infer<typeof riskLevel>;
