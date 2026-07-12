import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const trademarkMarkType = z.enum([
  "standard_characters",
  "figurative",
  "sound",
  "color",
  "motion",
  "hologram",
  "position",
  "other",
]);

export const trademarkApplicationStatus = z.enum([
  "draft",
  "prior_search",
  "review",
  "filed",
  "registered",
  "withdrawn",
]);

export const trademarkFilingMethod = z.enum(["online", "paper"]);

export const trademarkMarksFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  marks: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: trademarkMarkType,
      representation: z.string(),
      specimen_note: z.string().optional(),
      specimen_path: z.string().optional(),
      j_platpat_search_hint: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const trademarkGoodsServicesFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  catalogs: z.array(
    z.object({
      id: z.string(),
      mark_ids: z.array(z.string()).default([]),
      classes: z.array(
        z.object({
          class_no: z.number().int().min(1).max(45),
          heading: z.string().optional(),
          items: z.array(z.string()).min(1),
          notes: z.string().optional(),
        })
      ),
      j_platpat_goods_search_url: z.string().url().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const trademarkFieldMapFileSchema = z.object({
  mappings: z.array(
    z.object({
      form_field: z.string(),
      source: z.string(),
      format: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export const trademarkRegistryFileSchema = z.object({
  applications: z.array(
    z.object({
      id: z.string(),
      mark_id: z.string(),
      goods_services_id: z.string(),
      status: trademarkApplicationStatus.default("draft"),
      filing_method: trademarkFilingMethod.default("online"),
      reference_number: z.string().optional(),
      filing_date: isoDate.optional(),
      docs_root: z.string().optional(),
      agent_name: z.string().optional(),
      agent_registration_no: z.string().optional(),
      updated_on: isoDate.optional(),
      notes: z.string().optional(),
    })
  ),
});

export const trademarkSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["guide", "form_guide", "tool", "law", "fee"]),
      notes: z.string().optional(),
    })
  ),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      template: z.string(),
      legal_basis: z.string().optional(),
      when_required: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
});

export type TrademarkMark = z.output<typeof trademarkMarksFileSchema>["marks"][number];
export type TrademarkGoodsServicesCatalog = z.output<
  typeof trademarkGoodsServicesFileSchema
>["catalogs"][number];
export type TrademarkApplication = z.output<
  typeof trademarkRegistryFileSchema
>["applications"][number];
