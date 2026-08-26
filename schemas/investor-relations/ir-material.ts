import { z } from "zod";
import { dateString } from "../common.js";

export const irMaterialTypeSchema = z.enum([
  "earnings_deck",
  "shareholder_letter",
  "fact_sheet",
  "press_release",
  "data_room",
  "other",
]);

export const irMaterialStatusSchema = z.enum([
  "draft",
  "in_review",
  "approved",
  "published",
  "archived",
]);

export const irMaterialSchema = z.object({
  id: z.string().regex(/^IRM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  title: z.string().min(1),
  type: irMaterialTypeSchema,
  status: irMaterialStatusSchema.default("draft"),
  as_of: dateString.optional(),
  doc_ref: z.string().optional(),
  disclosure_id: z.string().optional(),
  approval_id: z
    .string()
    .regex(/^APR-\d{8}-\d{3,}$/)
    .optional(),
  notes: z.string().optional(),
});

export const irMaterialsFileSchema = z.object({
  version: z.literal(1).default(1),
  materials: z.array(irMaterialSchema).default([]),
  notes: z.string().optional(),
});

export type IrMaterial = z.output<typeof irMaterialSchema>;
export type IrMaterialsFile = z.output<typeof irMaterialsFileSchema>;
