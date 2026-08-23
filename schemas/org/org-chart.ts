import { z } from "zod";

/** Board vs operational reporting line (Canvas 組織図用 · L1). */
export const orgChartLayerSchema = z.enum(["board", "staff"]);

export const orgChartBoardRoleSchema = z.enum([
  "representative_director",
  "outside_non_executive",
  "director",
  "none",
]);

export const orgChartNodeSchema = z.object({
  id: z.string().min(1),
  /** Optional link to `data/hr/employees.yaml` */
  employee_id: z.string().min(1).optional(),
  /** Short display name for Canvas (L1 · 姓など) */
  display_name: z.string().min(1),
  /** Informal labels only. Never interpreted as canonical-name changes. */
  aliases: z.array(z.string().min(1)).optional(),
  title: z.string().min(1),
  /** 機能区分（営業 · 管理 など） */
  function: z.string().min(1).default("—"),
  layer: orgChartLayerSchema,
  board_role: orgChartBoardRoleSchema.default("none"),
  /** Parent node id in reporting line; omit for roots / board-only */
  reports_to: z.string().min(1).nullable().optional(),
  /**
   * Canvas view suites owned by this org unit (menu hierarchy).
   * Suite ids must match `steward/platform/canvas-views/registry.yaml`.
   */
  canvas_suites: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

export const orgChartFileSchema = z.object({
  version: z.literal(1),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  company_label: z.string().optional(),
  notes: z.string().optional(),
  nodes: z.array(orgChartNodeSchema).min(1),
});

export type OrgChartNode = z.output<typeof orgChartNodeSchema>;
export type OrgChartFile = z.output<typeof orgChartFileSchema>;
