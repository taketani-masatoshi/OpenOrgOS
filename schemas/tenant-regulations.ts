import { z } from "zod";

export const tenantRegulationEntrySchema = z.object({
  id: z.string().regex(/^REG-\d{3}$/),
  enabled: z.boolean(),
  notes: z.string().optional(),
});

export const tenantRegulationsFileSchema = z.object({
  regulations: z.array(tenantRegulationEntrySchema).default([]),
});

export type TenantRegulationEntry = z.infer<typeof tenantRegulationEntrySchema>;
export type TenantRegulationsFile = z.infer<typeof tenantRegulationsFileSchema>;
