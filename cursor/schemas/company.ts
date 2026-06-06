import { z } from "zod";
import { dateString } from "./common.js";

export const directorSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
});

export const companySchema = z.object({
  name: z.string().min(1),
  corporate_number: z.string().optional(),
  established_date: dateString.optional(),
  representative: z.string().optional(),
  directors: z.array(directorSchema).optional(),
  address: z.string().optional(),
  business_description: z.string().optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).optional(),
  tax_advisor: z.string().optional(),
  judicial_scrivener: z.string().optional(),
  administrative_scrivener: z.string().optional(),
  legal_advisor: z.string().optional(),
});

export type Director = z.infer<typeof directorSchema>;
export type Company = z.infer<typeof companySchema>;
