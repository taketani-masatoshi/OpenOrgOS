import { z } from "zod";
import { dateString } from "./common.js";

const dateTimeString = z.string().datetime({ offset: true });

export const softwareDeliveryFileSchema = z.object({
  version: z.literal(1),
  window_start: dateString,
  window_end: dateString,
  deployments: z
    .array(
      z.object({
        id: z.string().min(1),
        started_at: dateTimeString,
        deployed_at: dateTimeString,
        failed: z.boolean().default(false),
        rework: z.boolean().default(false),
        evidence_ref: z.string().min(1),
      }),
    )
    .default([]),
  incidents: z
    .array(
      z.object({
        id: z.string().min(1),
        started_at: dateTimeString,
        restored_at: dateTimeString.optional(),
        deployment_id: z.string().min(1).optional(),
        evidence_ref: z.string().min(1),
      }),
    )
    .default([]),
});

export const kpiRegisterFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  kpis: z
    .array(
      z.object({
        id: z.string().min(1),
        measured_at: dateTimeString,
        source_ref: z.string().min(1),
        method_ref: z.string().min(1),
        test_set_ref: z.string().min(1).optional(),
        owner_role: z.string().min(1),
      }),
    )
    .default([]),
});

export const productPortfolioFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum(["backlog", "active", "blocked", "done", "cancelled"]),
        due_on: dateString.optional(),
        updated_on: dateString.optional(),
        outcome_ref: z.string().min(1).optional(),
        evidence_refs: z.array(z.string().min(1)).default([]),
        owner_role: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export const supportRegisterFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  tickets: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum(["open", "pending", "resolved", "closed"]),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        opened_at: dateTimeString,
        first_response_due_at: dateTimeString.optional(),
        resolution_due_at: dateTimeString.optional(),
        first_responded_at: dateTimeString.optional(),
        resolved_at: dateTimeString.optional(),
        customer_ref: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export const communicationsRegisterFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum([
          "draft",
          "in_review",
          "approved",
          "published",
          "cancelled",
        ]),
        channel: z.string().min(1),
        due_on: dateString.optional(),
        approval_ref: z.string().min(1).optional(),
        evidence_ref: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export const personalFinanceChecklistFileSchema = z.object({
  version: z.literal(1),
  as_of: dateString,
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        category: z.enum([
          "budget",
          "emergency_reserve",
          "insurance",
          "tax",
          "estate",
          "records",
        ]),
        status: z.enum([
          "not_started",
          "in_progress",
          "complete",
          "not_applicable",
        ]),
        evidence_ref: z.string().min(1).optional(),
        review_due_on: dateString.optional(),
        professional_handoff_ref: z.string().min(1).optional(),
      }),
    )
    .default([]),
});

export type SoftwareDeliveryFile = z.output<typeof softwareDeliveryFileSchema>;
export type KpiRegisterFile = z.output<typeof kpiRegisterFileSchema>;
export type ProductPortfolioFile = z.output<typeof productPortfolioFileSchema>;
export type SupportRegisterFile = z.output<typeof supportRegisterFileSchema>;
export type CommunicationsRegisterFile = z.output<
  typeof communicationsRegisterFileSchema
>;
export type PersonalFinanceChecklistFile = z.output<
  typeof personalFinanceChecklistFileSchema
>;
