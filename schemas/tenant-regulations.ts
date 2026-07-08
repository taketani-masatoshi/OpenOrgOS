import { z } from "zod";

export const tenantRegulationEntrySchema = z.object({
  id: z.string().regex(/^REG-[A-Z0-9-]+$/),
  enabled: z.boolean(),
  notes: z.string().optional(),
});

export const tenantRegulationsFileSchema = z.object({
  regulations: z.array(tenantRegulationEntrySchema).default([]),
});

export type TenantRegulationEntry = z.output<typeof tenantRegulationEntrySchema>;
export type TenantRegulationsFile = z.output<typeof tenantRegulationsFileSchema>;
