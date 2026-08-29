/**
 * Construction module — activation seed schemas (co-located with the module CLI).
 *
 * Mirrors the catalog seed contract in `schemas/catalog-module-seeds.ts`: status is
 * an open string there, so it stays open here to avoid rejecting tenant ledgers
 * that the catalog check accepts.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Site lifecycle value the progress report is scoped to. */
export const SITE_STATUS_IN_PROGRESS = "in_progress";
/** Terminal phase status — everything else counts as an open phase. */
export const PHASE_STATUS_COMPLETE = "complete";

export const constructionSitesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  sites: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      client: z.string().min(1).optional(),
      start_date: isoDate.optional(),
      end_date: isoDate.optional(),
      status: z.string().min(1),
    })
  ),
});

export const constructionPhasesFileSchema = z.object({
  entity: z.string().min(1).optional(),
  as_of: isoDate.optional(),
  phases: z.array(
    z.object({
      id: z.string().min(1),
      site_id: z.string().min(1),
      name: z.string().min(1),
      planned_end: isoDate.optional(),
      actual_end: isoDate.optional(),
      status: z.string().min(1),
    })
  ),
});

export type ConstructionSitesFile = z.output<typeof constructionSitesFileSchema>;
export type ConstructionPhasesFile = z.output<typeof constructionPhasesFileSchema>;
export type ConstructionSite = ConstructionSitesFile["sites"][number];
export type ConstructionPhase = ConstructionPhasesFile["phases"][number];
