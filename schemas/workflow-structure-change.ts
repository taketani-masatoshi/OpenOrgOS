import { z } from "zod";
import { changeGradeSchema } from "./operator-change.js";
import { workflowDocumentSchema, workflowIdSchema } from "./workflow-canvas.js";

/** Org approval subject_type for workflow structure proposals. */
export const WORKFLOW_STRUCTURE_SUBJECT = "workflow.structure";

export const workflowStructureChangeIdSchema = z
  .string()
  .regex(/^WFS-\d{8}-\d{3}$/);

export const workflowFindingSeveritySchema = z.enum(["error", "warning", "info"]);

export const workflowFindingSchema = z.object({
  code: z.string().min(1),
  severity: workflowFindingSeveritySchema,
  message: z.string().min(1),
  node_id: z.string().min(1).optional(),
  edge_id: z.string().min(1).optional(),
});

export const workflowRegulationReferenceSchema = z.object({
  reg_id: z.string().regex(/^REG-[A-Z0-9-]+$/),
  clause: z.string().min(1),
  artifact_path: z.string().min(1),
});

export const workflowStructureChangeInputSchema = z
  .object({
    workflow_id: workflowIdSchema,
    grade: changeGradeSchema.default("A"),
    reason: z.string().min(1),
    regulation_ref: workflowRegulationReferenceSchema.optional(),
    draft_document: workflowDocumentSchema,
    proposed_document: workflowDocumentSchema,
    findings: z.array(workflowFindingSchema).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.draft_document.workflow_id !== value.workflow_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["draft_document", "workflow_id"],
        message: "draft_document.workflow_id must equal workflow_id",
      });
    }
    if (value.proposed_document.workflow_id !== value.workflow_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposed_document", "workflow_id"],
        message: "proposed_document.workflow_id must equal workflow_id",
      });
    }
    if ((value.grade === "B" || value.grade === "C") && !value.regulation_ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["regulation_ref"],
        message: "grade B/C requires regulation_ref",
      });
    }
  });

export const workflowStructureChangeProposalSchema =
  workflowStructureChangeInputSchema.and(
    z.object({
      change_id: workflowStructureChangeIdSchema,
      approval_id: z.string().regex(/^APR-\d{8}-\d{3}$/),
      proposed_at: z.string().datetime(),
      proposed_by: z.string().min(1),
    }),
  );

export const workflowStructureChangeAuditEventSchema = z.discriminatedUnion(
  "event_type",
  [
    z.object({
      event_type: z.literal("workflow.structure.proposed"),
      occurred_at: z.string().datetime(),
      proposal: workflowStructureChangeProposalSchema,
    }),
    z.object({
      event_type: z.literal("workflow.structure.applied"),
      occurred_at: z.string().datetime(),
      change_id: workflowStructureChangeIdSchema,
      workflow_id: workflowIdSchema,
      applied_by: z.string().min(1),
      approval_id: z.string().regex(/^APR-\d{8}-\d{3}$/),
      before_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      after_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
  ],
);

export type WorkflowFindingSeverity = z.output<typeof workflowFindingSeveritySchema>;
export type WorkflowFinding = z.output<typeof workflowFindingSchema>;
export type WorkflowStructureChangeInput = z.output<
  typeof workflowStructureChangeInputSchema
>;
export type WorkflowStructureChangeProposal = z.output<
  typeof workflowStructureChangeProposalSchema
>;
export type WorkflowStructureChangeAuditEvent = z.output<
  typeof workflowStructureChangeAuditEventSchema
>;
