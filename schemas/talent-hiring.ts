import { z } from "zod";
import { dateString } from "./common.js";

export const talentCandidateSchema = z
  .object({
    candidate_id: z.string().min(1),
    display_name: z.string().min(1),
    hourly_rate: z.number().nonnegative(),
    learns_procedure: z.boolean(),
    follows_any_supervisor: z.boolean(),
    adapts_to_one_change: z.boolean(),
    reports_exceptions: z.boolean(),
    safe_workwear: z.boolean(),
  })
  .strict();

export const engagementKindSchema = z.enum(["contractor", "fixed_term", "regular"]);

export const contractTermsSchema = z.object({
  engagement: engagementKindSchema,
  hours: z.number().nonnegative(),
  currency: z.string().min(1),
  max_total: z.number().nonnegative(),
});

export const noticeProcedureSchema = z.enum(["thirty_day_notice", "notice_allowance"]);

export const laborConditionsSchema = z.object({
  period_fixed: z.boolean(),
  wage: z.string().min(1),
  work_hours: z.string().min(1),
  workplace: z.string().min(1),
});

export const regularPrerequisitesSchema = z
  .object({
    work_rules_ref: z.string().min(1),
    dismissal_ground_refs: z.array(z.string().min(1)).min(1),
    notice_procedure: noticeProcedureSchema,
    probation_days: z.number().int().nonnegative(),
    labor_conditions: laborConditionsSchema,
  })
  .strict();

export const passKeyApprovalPayloadSchema = z.object({
  rfp_title: z.string().min(1),
  candidate_ids: z.array(z.string().min(1)),
  terms: contractTermsSchema,
  engagement: engagementKindSchema,
  prerequisites: z
    .object({
      work_rules_ref: z.string().min(1),
      dismissal_ground_refs: z.array(z.string().min(1)).min(1),
      notice_procedure: noticeProcedureSchema,
      probation_days: z.number().int().nonnegative(),
    })
    .optional(),
});

export type EngagementKind = z.output<typeof engagementKindSchema>;
export type TalentCandidate = z.output<typeof talentCandidateSchema>;
export type ContractTerms = z.output<typeof contractTermsSchema>;
export type RegularPrerequisites = z.output<typeof regularPrerequisitesSchema>;
export type PassKeyApprovalPayload = z.output<typeof passKeyApprovalPayloadSchema>;

export const engagementDiscussAnswersSchema = z
  .object({
    company_directs: z.boolean().optional(),
    fixed_term_days: z.number().int().positive().nullable().optional(),
    deliverable_only: z.boolean().optional(),
  })
  .strict();

export const engagementDiscussQuestionFieldSchema = z.enum([
  "company_directs",
  "fixed_term_days",
  "deliverable_only",
]);

export type EngagementDiscussAnswers = z.output<typeof engagementDiscussAnswersSchema>;
export type EngagementDiscussQuestionField = z.output<typeof engagementDiscussQuestionFieldSchema>;

export interface EngagementDiscussQuestion {
  field: EngagementDiscussQuestionField;
  prompt: string;
}

export interface EngagementOption {
  engagement: EngagementKind;
  reasons: string[];
  requires_prerequisites?: boolean;
}

export type EngagementDiscussResult =
  | { status: "need_answers"; questions: EngagementDiscussQuestion[] }
  | { status: "rejected"; reason: string }
  | {
      status: "ready";
      recommended: EngagementKind;
      options: EngagementOption[];
    };

export interface HiringPack {
  engagement: EngagementKind;
  internal_job_summary: string;
  exit_name: string;
  notes: string[];
}

export const jobHearingAnswersSchema = z
  .object({
    work_summary: z.string().min(1).optional(),
    starts_on: dateString.optional(),
    duration_days: z.number().int().positive().optional(),
    headcount: z.number().int().positive().optional(),
    max_hourly_rate: z.number().positive().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  })
  .strict();

export const jobHearingQuestionFieldSchema = z.enum([
  "work_summary",
  "starts_on",
  "duration_days",
  "headcount",
  "pay",
]);

export const practicalCheckSchema = z.enum([
  "説明のあと、手順を一人で1サイクル完了できる",
  "指示者の年齢や役職に関係なく、担当者の指示どおりに動ける",
  "作業中の手順変更1つに合わせられる",
  "わからないことと異常をその場で報告できる",
  "指定の服装で、髪・爪・装飾が作業の妨げにならない",
]);

export const jobPostingSchema = z.object({
  title: z.string().min(1),
  starts_on: dateString,
  duration_days: z.number().int().positive(),
  headcount: z.number().int().positive(),
  max_hourly_rate: z.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  duties: z.string().min(1),
  checks: z.array(practicalCheckSchema).length(5),
  body: z.string().min(1),
});

export type JobHearingAnswers = z.output<typeof jobHearingAnswersSchema>;
export type JobHearingQuestionField = z.output<typeof jobHearingQuestionFieldSchema>;
export type JobPosting = z.output<typeof jobPostingSchema>;

export interface JobHearingQuestion {
  field: JobHearingQuestionField;
  prompt: string;
}

export type JobHearingResult =
  | { status: "need_answers"; questions: JobHearingQuestion[] }
  | { status: "rejected"; reason: string }
  | { status: "ready"; posting: JobPosting };
