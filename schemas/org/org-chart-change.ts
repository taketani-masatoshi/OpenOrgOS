import { z } from "zod";
import {
  orgChartBoardRoleSchema,
  orgChartLayerSchema,
  orgChartNodeSchema,
} from "./org-chart.js";

export const orgChartChangeIntentSchema = z.enum([
  "display_correction",
  "canonical_name_change",
  "org_structure_change",
]);

export const orgChartChangeActionSchema = z.enum(["add", "update", "remove"]);

export const orgChartChangeIdSchema = z.string().regex(/^OCH-\d{8}-\d{3}$/);

export const orgRegulationReferenceSchema = z.object({
  reg_id: z.string().regex(/^REG-[A-Z0-9-]+$/),
  clause: z.string().min(1),
  artifact_path: z.string().min(1),
});

export const orgChartNodeChangesSchema = z
  .object({
    display_name: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).optional(),
    title: z.string().min(1).optional(),
    function: z.string().min(1).optional(),
    layer: orgChartLayerSchema.optional(),
    board_role: orgChartBoardRoleSchema.optional(),
    reports_to: z.string().min(1).nullable().optional(),
    canvas_suites: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const orgChartChangeInputSchema = z
  .object({
    intent: orgChartChangeIntentSchema,
    action: orgChartChangeActionSchema,
    node_id: z.string().min(1),
    reason: z.string().min(1),
    regulation_ref: orgRegulationReferenceSchema,
    changes: orgChartNodeChangesSchema.optional(),
    node: orgChartNodeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "add" && !value.node) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["node"],
        message: "add requires a complete node",
      });
    }
    if (value.action === "add" && value.node?.id !== value.node_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["node", "id"],
        message: "node.id must equal node_id",
      });
    }
    if (value.action === "update" && !value.changes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changes"],
        message: "update requires changes",
      });
    }
    if (value.action === "remove" && (value.node || value.changes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "remove does not accept node or changes",
      });
    }
  });

export const orgChartChangeProposalSchema = orgChartChangeInputSchema.and(
  z.object({
    change_id: orgChartChangeIdSchema,
    approval_id: z.string().regex(/^APR-\d{8}-\d{3}$/),
    proposed_at: z.string().datetime(),
    proposed_by: z.string().min(1),
  }),
);

export const boardResolutionEvidenceSchema = z.object({
  change_id: orgChartChangeIdSchema,
  board_event_id: z.string().regex(/^EVT-\d{8}-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  minutes_path: z.string().min(1),
  resolution_status: z.literal("approved"),
  resolution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quorum_confirmed: z.literal(true),
});

export const orgChartChangeAuditEventSchema = z.discriminatedUnion(
  "event_type",
  [
    z.object({
      event_type: z.literal("org_chart.change.proposed"),
      occurred_at: z.string().datetime(),
      proposal: orgChartChangeProposalSchema,
    }),
    z.object({
      event_type: z.literal("org_chart.change.apply_requested"),
      occurred_at: z.string().datetime(),
      change_id: orgChartChangeIdSchema,
      applied_by: z.string().min(1),
      approval_id: z.string().regex(/^APR-\d{8}-\d{3}$/),
      board_resolution: boardResolutionEvidenceSchema.optional(),
      before_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      after_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
    z.object({
      event_type: z.literal("org_chart.change.applied"),
      occurred_at: z.string().datetime(),
      change_id: orgChartChangeIdSchema,
      applied_by: z.string().min(1),
      approval_id: z.string().regex(/^APR-\d{8}-\d{3}$/),
      board_resolution: boardResolutionEvidenceSchema.optional(),
      before_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      after_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
  ],
);

export type OrgChartChangeIntent = z.output<typeof orgChartChangeIntentSchema>;
export type OrgChartChangeInput = z.output<typeof orgChartChangeInputSchema>;
export type OrgChartChangeProposal = z.output<
  typeof orgChartChangeProposalSchema
>;
export type BoardResolutionEvidence = z.output<
  typeof boardResolutionEvidenceSchema
>;
export type OrgChartChangeAuditEvent = z.output<
  typeof orgChartChangeAuditEventSchema
>;
