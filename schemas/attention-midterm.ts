/**
 * Wave2 mid-term attention SoT — HR attendance review, IT loans, PMO projects.
 * L1 fields only (no personal contact details).
 */
import { z } from "zod";
import { dateString } from "./common.js";

export const attendanceReviewStatus = z.enum([
  "pending",
  "in_review",
  "approved",
  "rejected",
]);

export const attendanceReviewSchema = z.object({
  id: z.string().min(1),
  period_start: dateString,
  period_end: dateString,
  review_due: dateString,
  status: attendanceReviewStatus.default("pending"),
  /** Link only — never embed personal name in Canvas */
  employee_ref: z.string().min(1),
  approver_id: z.string().optional(),
  site_id: z.string().optional(),
  notes: z.string().max(240).optional(),
  demo: z.boolean().optional(),
});

export const attendanceReviewsFileSchema = z.object({
  as_of: dateString.optional(),
  reviews: z.array(attendanceReviewSchema).default([]),
});

export const itLoanStatus = z.enum(["active", "overdue", "returned"]);

export const itLoanSchema = z.object({
  id: z.string().min(1),
  asset_label: z.string().min(1).max(120),
  stakeholder_id: z.string().min(1),
  loaned_on: dateString,
  return_due: dateString,
  status: itLoanStatus.default("active"),
  notes: z.string().max(240).optional(),
  demo: z.boolean().optional(),
});

export const itLoansFileSchema = z.object({
  as_of: dateString.optional(),
  loans: z.array(itLoanSchema).default([]),
});

export const projectAttentionStatus = z.enum([
  "active",
  "blocked",
  "done",
  "cancelled",
]);

export const projectAttentionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  status: projectAttentionStatus.default("active"),
  next_milestone_due: dateString.optional(),
  blocker_summary: z.string().max(200).optional(),
  owner: z.string().optional(),
  demo: z.boolean().optional(),
});

export const projectsAttentionFileSchema = z.object({
  as_of: dateString.optional(),
  projects: z.array(projectAttentionSchema).default([]),
});

export const workforcePersonSchema = z.object({
  id: z.string().min(1),
  /** Authenticated operator surfaces may use this; executive summaries must not. */
  name: z.string().min(1).max(120).optional(),
  employee_id: z
    .string()
    .regex(/^EMP-\d{3,}$/)
    .optional(),
  contract_id: z
    .string()
    .regex(/^CTR-\d{3,}$/)
    .optional(),
  org_node_id: z.string().min(1).optional(),
  org_unit_id: z.string().min(1).optional(),
  employment_type: z.enum(["full_time", "part_time", "contractor", "other"]),
  end_date: dateString.optional(),
  role_label: z.string().max(80).optional(),
  demo: z.boolean().optional(),
});

export const workforceFileSchema = z.object({
  as_of: dateString.optional(),
  people: z.array(workforcePersonSchema).default([]),
});

export type AttendanceReview = z.output<typeof attendanceReviewSchema>;
export type ItLoan = z.output<typeof itLoanSchema>;
export type ItLoanStatus = z.output<typeof itLoanStatus>;
export type ProjectAttention = z.output<typeof projectAttentionSchema>;
