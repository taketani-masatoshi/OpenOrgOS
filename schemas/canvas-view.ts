import { z } from "zod";

/** View Model section types — closed set; extend deliberately for Web/Cursor dual render. */
export const canvasViewStatItemSchema = z.object({
  value: z.string(),
  label: z.string(),
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
});

export const canvasViewSectionStatsSchema = z.object({
  type: z.literal("stats"),
  items: z.array(canvasViewStatItemSchema).min(1),
});

/** Plain string or toned / linked cell (href = read-only Web path, e.g. /t/mal/...). */
export const canvasViewTableCellSchema = z.union([
  z.string(),
  z.object({
    text: z.string(),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    /** Relative Web path for SPA navigation (read-only · no mutations). */
    href: z
      .string()
      .regex(/^\/t\/[a-z0-9_-]+(\/[a-z0-9_-]+)*\/?$/i)
      .optional(),
  }),
]);

export type CanvasViewTableCell = z.output<typeof canvasViewTableCellSchema>;

export const canvasViewSectionTableSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(canvasViewTableCellSchema)),
});

export const canvasViewBarSeriesSchema = z.object({
  name: z.string(),
  data: z.array(z.number()),
  /** Semantic color — info≈青 · danger≈赤（Web / Cursor 双方） */
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
});

export const canvasViewSectionBarsSchema = z.object({
  type: z.literal("bars"),
  title: z.string().optional(),
  categories: z.array(z.string()),
  series: z.array(canvasViewBarSeriesSchema).min(1),
  /**
   * `grouped`（既定）: 全系列をゼロ基準から上方向。
   * `diverging`: 正は上・負は下（例: 入金↑ / 出金↓）。
   */
  layout: z.enum(["grouped", "diverging"]).optional(),
  /** Optional second chart overlay (e.g. closing balance line) */
  line_series: z.array(canvasViewBarSeriesSchema).optional(),
});

export const canvasViewSectionCalloutSchema = z.object({
  type: z.literal("callout"),
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
  title: z.string().optional(),
  body: z.string(),
});

export const canvasViewSectionTextSchema = z.object({
  type: z.literal("text"),
  title: z.string().optional(),
  lines: z.array(z.string()).min(1),
});

/** Hierarchical diagram — positions baked by builder (Cursor + Web dual render). */
export const canvasViewDiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
  kind: z.enum(["root", "branch", "leaf", "detached"]).optional(),
});

export const canvasViewDiagramEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  source_x: z.number(),
  source_y: z.number(),
  target_x: z.number(),
  target_y: z.number(),
  style: z.enum(["solid", "dashed"]).optional(),
});

export const canvasViewSectionDiagramSchema = z.object({
  type: z.literal("diagram"),
  title: z.string().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  nodes: z.array(canvasViewDiagramNodeSchema).min(1),
  edges: z.array(canvasViewDiagramEdgeSchema),
});

/** Month-grid calendar — deadline boards (tax filing, etc.). */
export const canvasViewCalendarEventSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(80),
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
  sublabel: z.string().max(60).optional(),
});

export type CanvasViewCalendarEvent = z.output<
  typeof canvasViewCalendarEventSchema
>;

export const canvasViewSectionCalendarSchema = z.object({
  type: z.literal("calendar"),
  title: z.string().optional(),
  /** Highlight “today” cell */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  events: z.array(canvasViewCalendarEventSchema).max(80),
});

export const canvasViewSectionSchema = z.discriminatedUnion("type", [
  canvasViewSectionStatsSchema,
  canvasViewSectionTableSchema,
  canvasViewSectionBarsSchema,
  canvasViewSectionCalloutSchema,
  canvasViewSectionTextSchema,
  canvasViewSectionDiagramSchema,
  canvasViewSectionCalendarSchema,
]);

export const canvasViewRelatedLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().regex(/^\/t\/[a-z0-9_-]+(\/[a-z0-9_-]+)*\/?$/i),
});

export const canvasViewLinksSchema = z.object({
  cursor_hint: z.string().optional(),
  /** Read-only Web path for this board (e.g. /t/mal/compliance/obligations) */
  web_path: z.string().optional(),
  /** CLI to re-present / sync this suite */
  present_cmd: z.string().optional(),
  /** Sibling / parent boards for Web quick-nav (read-only). */
  related: z.array(canvasViewRelatedLinkSchema).max(12).optional(),
});

/**
 * L1 Canvas View Model — shared intermediate for Cursor Canvas and read-only Web.
 * Must not embed L2 (account numbers, mail body, personal contact details).
 */
export const canvasViewModelSchema = z.object({
  version: z.literal(1),
  tenant: z.string().min(1),
  suite: z.enum([
    "secretary",
    "executive",
    "sales",
    "wire",
    "ops",
    "contract",
    "compliance",
    "finance",
    "hospitality",
    "hr",
    "projects",
    "logistics",
    "inventory",
    "rental",
  ]),
  view_id: z.string().min(1),
  updated_at: z.string().min(1),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1),
  summary: z.string().optional(),
  /** Brand / date line under title */
  eyebrow: z.string().optional(),
  subtitle: z.string().optional(),
  sections: z.array(canvasViewSectionSchema),
  links: canvasViewLinksSchema.optional(),
});

export type CanvasViewModel = z.output<typeof canvasViewModelSchema>;
export type CanvasViewSection = z.output<typeof canvasViewSectionSchema>;

export const canvasViewRegistryEntrySchema = z.object({
  id: z.string().min(1),
  /** User-facing board name (Web 一覧など) */
  label: z.string().min(1),
  builder: z.string().min(1),
  cursor_out: z.string().min(1),
  web_path: z.string().min(1),
});

export const canvasViewRegistrySuiteSchema = z.object({
  label: z.string().min(1),
  views: z.array(canvasViewRegistryEntrySchema).min(1),
});

export const canvasViewRegistrySchema = z.object({
  version: z.literal(1),
  suites: z.record(z.string(), canvasViewRegistrySuiteSchema),
});

export type CanvasViewRegistry = z.output<typeof canvasViewRegistrySchema>;
export type CanvasViewRegistryEntry = z.output<typeof canvasViewRegistryEntrySchema>;
