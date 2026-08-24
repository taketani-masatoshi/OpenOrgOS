import { z } from "zod";
import { operatorPermissionSchema } from "./operator.js";

/** Per org-unit authority + L1 budget envelope (万円). */
export const orgAuthorityUnitSchema = z.object({
  org_unit_id: z.string().min(1),
  head_operator_id: z.string().min(1).optional(),
  allowed_agents: z.array(z.string().min(1)).default([]),
  permissions: z.array(operatorPermissionSchema).default([]),
  budget_plan_man: z.number().nonnegative(),
  budget_actual_man: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const orgAuthorityFileSchema = z.object({
  version: z.literal(1),
  fiscal_year: z.string().min(1),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
  units: z.array(orgAuthorityUnitSchema).min(1),
});

export type OrgAuthorityUnit = z.output<typeof orgAuthorityUnitSchema>;
export type OrgAuthorityFile = z.output<typeof orgAuthorityFileSchema>;
