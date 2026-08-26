import { z } from "zod";

export const changeGradeSchema = z.enum(["A", "B", "C"]);

export const changeEditSchema = z.object({
  path: z.string().min(1),
  /** Dot-path into YAML document, e.g. hotel.opened_date or max_guests */
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export const changeIntentSchema = z.object({
  grade: changeGradeSchema,
  summary: z.string().min(1),
  /** Optional known intent id for grade A shortcuts */
  intent_id: z
    .enum(["set_opened_date", "set_max_guests", "sync_derived", "generic"])
    .default("generic"),
  property_id: z.string().optional(),
  opened_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  max_guests: z.number().int().positive().optional(),
  edits: z.array(changeEditSchema).default([]),
  notes: z.string().optional(),
});

export const changeProposalStatusSchema = z.enum([
  "planned",
  "dry_run_ok",
  "applied",
  "rejected",
]);

export const changeProposalSchema = z.object({
  proposal_id: z.string().min(1),
  created_at: z.string().datetime(),
  grade: changeGradeSchema,
  summary: z.string().min(1),
  intent_id: z.string(),
  allow_paths: z.array(z.string()),
  proposed_edits: z.array(changeEditSchema),
  sync_derived: z.boolean().default(false),
  status: changeProposalStatusSchema.default("planned"),
  warnings: z.array(z.string()).default([]),
  blocked_reason: z.string().optional(),
});

export const changeApplyOptionsSchema = z.object({
  dry_run: z.boolean().default(true),
  write: z.boolean().default(false),
  /** Required for grade B apply */
  i_understand_grade_b: z.boolean().default(false),
  operator_id: z.string().optional(),
});

export type ChangeGrade = z.output<typeof changeGradeSchema>;
export type ChangeEdit = z.output<typeof changeEditSchema>;
export type ChangeIntent = z.output<typeof changeIntentSchema>;
export type ChangeProposal = z.output<typeof changeProposalSchema>;
export type ChangeApplyOptions = z.output<typeof changeApplyOptionsSchema>;
