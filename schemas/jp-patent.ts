import { z } from "zod";
import { isoDate } from "./iso-date.js";

export const patentAsOfDate = isoDate;

export const patentApplicationStatus = z.enum([
  "draft",
  "review",
  "filed",
  "allowed",
  "registered",
  "abandoned",
  "withdrawn",
  "lapsed",
]);

export const patentPriorityKind = z.enum(["domestic", "paris"]);

/** 公開態様。`patent_gazette` は特許法30条2項括弧書により同項の適用対象外。 */
export const patentDisclosureKind = z.enum([
  "publication",
  "presentation",
  "website",
  "exhibition",
  "sale",
  "trial",
  "broadcast",
  "patent_gazette",
  "other",
]);

export const patentPriorityClaimSchema = z.object({
  kind: patentPriorityKind,
  base_filed_on: isoDate,
  base_application_no: z.string().optional(),
  /** パリ条約優先権の第一国（様式第26 備考27【国・地域名】） */
  base_country: z.string().optional(),
});

export const patentDisclosureSchema = z.object({
  disclosed_on: isoDate,
  kind: patentDisclosureKind,
  /** true = 特許法30条1項（意に反する公開）· false = 同条2項（自己の行為に起因する公開） */
  against_will: z.boolean().default(false),
  certificate_submitted_on: isoDate.optional(),
  description: z.string().optional(),
});

export const patentApplicationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: patentApplicationStatus.default("draft"),
  /** 出願人は company.yaml（field-map 経由）。共同出願人は stakeholder_id のみ。 */
  applicant_source: z.literal("company").default("company"),
  co_applicant_stakeholder_ids: z.array(z.string().min(1)).default([]),
  /** 発明者は stakeholder_id のみ（氏名・住所は L2 台帳 · 願書へは人間が転記） */
  inventor_stakeholder_ids: z.array(z.string().min(1)).default([]),
  reference_number: z.string().optional(),
  ipc: z.array(z.string().min(1)).default([]),
  planned_filing_on: isoDate.optional(),
  filed_on: isoDate.optional(),
  application_no: z.string().optional(),
  priority_claims: z.array(patentPriorityClaimSchema).default([]),
  disclosures: z.array(patentDisclosureSchema).default([]),
  exam_requested_on: isoDate.optional(),
  published_on: isoDate.optional(),
  allowance_served_on: isoDate.optional(),
  registered_on: isoDate.optional(),
  patent_no: z.string().optional(),
  annuity_paid_through_year: z.number().int().min(1).optional(),
  agent_name: z.string().optional(),
  agent_registration_no: z.string().optional(),
  docs_root: z.string().optional(),
  updated_on: isoDate.optional(),
  notes: z.string().optional(),
});

export const patentRegistryFileSchema = z.object({
  entity: z.string().optional(),
  as_of: isoDate.optional(),
  applications: z.array(patentApplicationSchema),
});

export const patentClaimSchema = z.object({
  no: z.number().int().min(1),
  text: z.string().min(1),
  refers_to: z.array(z.number().int().min(1)).default([]),
  /** 施行規則24条の3第5号の判定用（「又は」= alternative · 「及び」= cumulative） */
  reference_mode: z.enum(["alternative", "cumulative"]).default("alternative"),
});

export const patentDrawingSchema = z.object({
  figure_no: z.number().int().min(1),
  description: z.string(),
});

export const patentSpecificationFileSchema = z.object({
  application_id: z.string().min(1),
  invention_title: z.string(),
  technical_field: z.string(),
  background_art: z.string().optional(),
  prior_art_documents: z
    .object({
      patent: z.array(z.string().min(1)).default([]),
      non_patent: z.array(z.string().min(1)).default([]),
    })
    .default({}),
  problem: z.string(),
  solution: z.string(),
  effects: z.string().optional(),
  drawings: z.array(patentDrawingSchema).default([]),
  embodiments: z.string(),
  industrial_applicability: z.string().optional(),
  reference_signs: z
    .array(z.object({ sign: z.string().min(1), label: z.string().min(1) }))
    .default([]),
  claims: z.array(patentClaimSchema).default([]),
  abstract: z.object({
    text: z.string(),
    selected_figure: z.number().int().min(1).optional(),
  }),
});

export const patentFieldMapFileSchema = z.object({
  mappings: z.array(
    z.object({
      form_field: z.string(),
      source: z.string(),
      notes: z.string().optional(),
    })
  ),
});

export const patentSourcesFileSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      type: z.enum(["law", "ordinance", "form", "guide", "treaty", "fee", "calendar", "tool"]),
      retrieved_on: isoDate,
      notes: z.string().optional(),
    })
  ),
  forms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      template: z.string(),
      output: z.string(),
      legal_basis: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
  fees: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        amount_jpy: z.number().int().positive().optional(),
        formula: z.string().optional(),
        source_id: z.string(),
        retrieved_on: isoDate,
      })
    )
    .default([]),
});

export const patentHolidaysFileSchema = z.object({
  source_url: z.string().url(),
  retrieved_on: isoDate,
  covered_years: z.array(z.number().int().min(2000)).min(1),
  national_holidays: z.array(z.object({ date: isoDate, name: z.string() })),
  year_end_closures: z.array(isoDate),
});

export type PatentApplicationStatus = z.output<typeof patentApplicationStatus>;
export type PatentPriorityClaim = z.output<typeof patentPriorityClaimSchema>;
export type PatentDisclosure = z.output<typeof patentDisclosureSchema>;
export type PatentApplication = z.output<typeof patentApplicationSchema>;
export type PatentRegistryFile = z.output<typeof patentRegistryFileSchema>;
export type PatentClaim = z.output<typeof patentClaimSchema>;
export type PatentDrawing = z.output<typeof patentDrawingSchema>;
export type PatentSpecification = z.output<typeof patentSpecificationFileSchema>;
export type PatentFieldMapFile = z.output<typeof patentFieldMapFileSchema>;
export type PatentSourcesFile = z.output<typeof patentSourcesFileSchema>;
export type PatentHolidaysFile = z.output<typeof patentHolidaysFileSchema>;
