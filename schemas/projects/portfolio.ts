import { z } from "zod";
import { dateString, riskLevel } from "../common.js";
import { agentId } from "../classification.js";

/** Prefixes reserved by other SoT id spaces — a project id must not use these. */
export const PMO_FOREIGN_ID_PREFIXES = [
  "CTR-",
  "APP-",
  "PROP-",
  "BANK-",
  "EMP-",
  "PER-",
  "IMP-",
  "WO-",
  "CHG-",
  "STK-",
  "FUND-",
  "HO-",
] as const;

export const PMO_PROJECT_ID_RE = /^PRJ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const pmoProjectId = z
  .string()
  .regex(PMO_PROJECT_ID_RE, "Project id must be PRJ-[A-Z0-9-]+")
  .refine((id) => !PMO_FOREIGN_ID_PREFIXES.some((p) => id.startsWith(p)), {
    message: "Project id collides with a foreign id prefix",
  });

export function isPmoProjectId(id: string): boolean {
  return PMO_PROJECT_ID_RE.test(id);
}

export function usesForeignIdPrefix(id: string): boolean {
  return PMO_FOREIGN_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export const pmoStatus = z.enum(["proposed", "active", "on_hold", "done", "cancelled"]);
export const pmoRag = z.enum(["green", "amber", "red"]);
export const pmoSponsorRole = z.enum(["ceo", "board", "coo"]);
export const pmoMilestoneStatus = z.enum(["open", "done", "cancelled", "missed"]);
export const pmoRiskStatus = z.enum(["open", "mitigated", "accepted", "closed"]);

export const pmoMilestoneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    due: dateString,
    status: pmoMilestoneStatus,
  })
  .strict();

export const pmoRiskSchema = z
  .object({
    id: z.string().min(1),
    summary: z.string().min(1),
    severity: riskLevel,
    status: pmoRiskStatus,
  })
  .strict();

export const pmoModuleRefSchema = z
  .object({
    module: z.string().min(1),
    ref: z.string().min(1).optional(),
  })
  .strict();

export const pmoProjectLinksSchema = z
  .object({
    contract_ids: z.array(z.string().regex(/^CTR-\d{3,}$/)).default([]),
    work_order_ids: z.array(z.string().regex(/^(IMP|WO)-[A-Z0-9-]+$/)).default([]),
    module_refs: z.array(pmoModuleRefSchema).default([]),
    property_ids: z.array(z.string().regex(/^PROP-\d{3,}$/)).default([]),
  })
  .strict();

export const pmoProjectSchema = z
  .object({
    id: pmoProjectId,
    title: z.string().min(1),
    status: pmoStatus,
    rag: pmoRag,
    owner_agent: agentId,
    sponsor: pmoSponsorRole,
    start_date: dateString.optional(),
    target_date: dateString.optional(),
    notes: z.string().optional(),
    milestones: z.array(pmoMilestoneSchema).default([]),
    risks: z.array(pmoRiskSchema).default([]),
    links: pmoProjectLinksSchema.default({
      contract_ids: [],
      work_order_ids: [],
      module_refs: [],
      property_ids: [],
    }),
  })
  .strict();

export const pmoPortfolioIndexEntrySchema = z
  .object({
    id: pmoProjectId,
    status: pmoStatus,
    rag: pmoRag,
    owner_agent: agentId,
  })
  .strict();

export const pmoPortfolioFileSchema = z
  .object({
    as_of: dateString.optional(),
    projects: z.array(pmoPortfolioIndexEntrySchema).default([]),
    notes: z.string().optional(),
  })
  .strict();

export type PmoStatus = z.output<typeof pmoStatus>;
export type PmoRag = z.output<typeof pmoRag>;
export type PmoSponsorRole = z.output<typeof pmoSponsorRole>;
export type PmoMilestone = z.output<typeof pmoMilestoneSchema>;
export type PmoRisk = z.output<typeof pmoRiskSchema>;
export type PmoModuleRef = z.output<typeof pmoModuleRefSchema>;
export type PmoProjectLinks = z.output<typeof pmoProjectLinksSchema>;
export type PmoProject = z.output<typeof pmoProjectSchema>;
export type PmoPortfolioIndexEntry = z.output<typeof pmoPortfolioIndexEntrySchema>;
export type PmoPortfolioFile = z.output<typeof pmoPortfolioFileSchema>;
