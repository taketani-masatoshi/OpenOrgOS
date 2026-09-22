import { z } from "zod";

/** Tenant map: property_id → project_code for project P/L. */
export const projectCodeEntrySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  property_id: z.string().regex(/^PROP-\d{3,}$/),
});

export const projectCodesFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectCodeEntrySchema).default([]),
});

export type ProjectCodeEntry = z.output<typeof projectCodeEntrySchema>;
export type ProjectCodesFile = z.output<typeof projectCodesFileSchema>;
