import { z } from "zod";

export const regulationBindSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("core"),
    group: z.enum(["governance", "ms"]),
  }),
  z.object({
    type: z.literal("iso"),
    iso_id: z.string().regex(/^ISO-\d{4,5}$/),
  }),
  z.object({
    type: z.literal("iso_any"),
    iso_ids: z.array(z.string().regex(/^ISO-\d{4,5}$/)).min(1),
  }),
  z.object({
    type: z.literal("module"),
    module_id: z.string(),
  }),
  z.object({
    type: z.literal("module_any"),
    module_ids: z.array(z.string()).min(1),
  }),
]);

export const catalogRegulationSchema = z.object({
  id: z.string().regex(/^REG-[A-Z0-9-]+$/),
  name: z.string(),
  template: z.string(),
  tenant_doc: z.string(),
  binds_to: regulationBindSchema,
  iso_ids: z.array(z.string()).optional(),
  /** Risk-domain tags for pack docs (cash · pii · permit · …). */
  risk_domains: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const regulationsCatalogSchema = z.object({
  regulations: z.array(catalogRegulationSchema),
});

export type RegulationBind = z.output<typeof regulationBindSchema>;
export type CatalogRegulation = z.output<typeof catalogRegulationSchema>;
export type RegulationsCatalog = z.output<typeof regulationsCatalogSchema>;
