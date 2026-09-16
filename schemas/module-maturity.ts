/**
 * Module Maturity Panel — catalog tiers + core capability lanes.
 * ADR: docs/adr/0074-module-maturity-panel.md
 */
import { z } from "zod";

export const readinessTierSchema = z.enum([
  "skeleton",
  "activation_ready",
  "production_ready",
]);

export const laneLevelSchema = z.enum([
  "missing",
  "thin",
  "operational",
  "closed",
]);

export const moduleMaturityRowSchema = z.object({
  id: z.string(),
  label: z.string(),
  tier: readinessTierSchema,
  installed: z.boolean(),
  enabled: z.boolean(),
  /** Enabled but not production_ready — ops risk. */
  risk: z.boolean(),
  notes: z.string().optional(),
  href: z.string().optional(),
});

export const coreLaneSchema = z.object({
  id: z.enum(["secretary", "mail", "task", "wire", "property_ops"]),
  label: z.string(),
  level: laneLevelSchema,
  summary: z.string(),
  href: z.string(),
  signals: z.array(z.string()),
});

export const moduleMaturityPanelSchema = z.object({
  ok: z.literal(true),
  tenant: z.string(),
  report_date: z.string(),
  summary: z.object({
    catalog_total: z.number().int().nonnegative(),
    installed: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    enabled_production_ready: z.number().int().nonnegative(),
    enabled_activation_ready: z.number().int().nonnegative(),
    enabled_skeleton: z.number().int().nonnegative(),
    risk_count: z.number().int().nonnegative(),
  }),
  lanes: z.array(coreLaneSchema),
  modules: z.array(moduleMaturityRowSchema),
  risks: z.array(moduleMaturityRowSchema),
});

export type ModuleMaturityPanel = z.infer<typeof moduleMaturityPanelSchema>;
export type ModuleMaturityRow = z.infer<typeof moduleMaturityRowSchema>;
export type CoreLane = z.infer<typeof coreLaneSchema>;
export type LaneLevel = z.infer<typeof laneLevelSchema>;
