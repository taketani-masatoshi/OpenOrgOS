import { z } from "zod";

export const investorContactTypeSchema = z.enum([
  "shareholder",
  "investor",
  "analyst",
  "prospect",
  "other",
]);

export const investorContactSchema = z.object({
  id: z.string().regex(/^INV-[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  label: z.string().min(1),
  type: investorContactTypeSchema,
  /** Optional stakeholder_id link — no personal contact values in tracked YAML. */
  stakeholder_ref: z.string().optional(),
  organization_label: z.string().optional(),
  notes: z.string().optional(),
});

export const investorRegistryFileSchema = z.object({
  version: z.literal(1).default(1),
  contacts: z.array(investorContactSchema).default([]),
  notes: z.string().optional(),
});

export type InvestorContact = z.output<typeof investorContactSchema>;
export type InvestorRegistryFile = z.output<typeof investorRegistryFileSchema>;
