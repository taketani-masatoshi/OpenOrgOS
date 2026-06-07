import { z } from "zod";

export const isoStandardEntrySchema = z.object({
  id: z.string().regex(/^ISO-\d{4,5}$/),
  enabled: z.boolean(),
  notes: z.string().optional(),
});

export const tenantStandardsFileSchema = z.object({
  iso: z.array(isoStandardEntrySchema).default([]),
});

export type IsoStandardEntry = z.infer<typeof isoStandardEntrySchema>;
export type TenantStandardsFile = z.infer<typeof tenantStandardsFileSchema>;
