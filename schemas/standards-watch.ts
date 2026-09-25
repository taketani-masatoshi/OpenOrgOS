import { z } from "zod";

export const standardsWatchEntrySchema = z.object({
  standard_id: z.string().min(1),
  title: z.string().min(1),
  authority: z.string().min(1),
  official_sources: z.array(z.string().url()).min(1),
  auxiliary_sources: z.array(z.string().url()).default([]),
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  priority: z.enum(["critical", "high", "normal", "low"]),
  scope: z.enum(["common", "jp-module", "country-module", "finance", "governance"]),
  auto_apply: z.boolean().default(false),
  notify_on: z.array(z.enum(["new-release", "amendment", "withdrawal", "source-unavailable"])).min(1),
  last_checked_at: z.string().datetime({ offset: true }).optional(),
  last_known_version: z.string().optional(),
});

export const standardsWatchRegistrySchema = z.object({
  version: z.literal(1),
  server_id: z.string().min(1),
  entries: z.array(standardsWatchEntrySchema),
});

export const standardsChangeNoticeSchema = z.object({
  notice_id: z.string().min(1),
  standard_id: z.string().min(1),
  detected_at: z.string().datetime({ offset: true }),
  source_url: z.string().url(),
  change_type: z.enum(["new-release", "amendment", "withdrawal", "source-unavailable"]),
  previous_version: z.string().optional(),
  current_version: z.string().optional(),
  summary: z.string().min(1),
  requires_human_review: z.boolean().default(true),
  signature: z.string().min(1),
});

export type StandardsWatchEntry = z.output<typeof standardsWatchEntrySchema>;
export type StandardsChangeNotice = z.output<typeof standardsChangeNoticeSchema>;
