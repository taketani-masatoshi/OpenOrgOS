import { z } from "zod";

export const orgChartHistorySourceSchema = z.enum([
  "board_resolution",
  "och_applied",
  "current",
  "initial",
]);

export const orgChartHistoryEntrySchema = z.object({
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recorded_at: z.string().min(1).optional(),
  source: orgChartHistorySourceSchema.optional(),
  change_id: z.string().min(1).optional(),
  approval_id: z.string().min(1).optional(),
  notes: z.string().optional(),
  file: z.string().min(1).optional(),
});

export const orgChartHistoryIndexSchema = z.object({
  version: z.literal(1),
  entries: z.array(orgChartHistoryEntrySchema).default([]),
});

export type OrgChartHistorySource = z.output<typeof orgChartHistorySourceSchema>;
export type OrgChartHistoryEntry = z.output<typeof orgChartHistoryEntrySchema>;
export type OrgChartHistoryIndex = z.output<typeof orgChartHistoryIndexSchema>;
